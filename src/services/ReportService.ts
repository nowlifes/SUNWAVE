import type { Report, ReportType } from '@/types';

// ---------------------------------------------------------------------------
// User reports — the only channel that can fix what geometry will never see.
//
// The shadow engine models buildings. It does not model parasols, awnings,
// plane trees, scaffolding, a neighbour's new extension, or a terrace that was
// moved across the street. Those are precisely the things that make an app
// like this wrong in a way users notice immediately, and no amount of DEM or
// OSM accuracy will catch them. A report is the correction channel.
//
// This service existed but was wired to nothing. It now persists to
// localStorage (consistent with how the rest of the app stores preferences —
// no backend in this project yet) and exposes an adjustment that
// VenueSunService applies to computed curves.
//
// STORAGE NOTE: localStorage is per-device and per-browser. A report helps the
// person who made it and nobody else. Making reports actually useful means a
// shared backend (Supabase is already a dependency) with some agreement
// threshold before one user's report moves everyone's number — see the report
// in ~/.claude/research/ for what is left to do.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'sun_reports';

/** A report older than this stops affecting the calculation. Terraces change:
 *  a parasol goes up in June and comes down in October, scaffolding leaves.
 *  Without expiry, one report shades a venue forever. */
const REPORT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Ceiling applied to a venue's hourly sun % when users report it shaded.
 *  Not zero: the report says "there is shade here you did not model", not
 *  "this place never sees the sun". */
const SHADED_CEILING_PCT = 25;

/** Floor applied when users report a venue sunnier than we computed — the
 *  mirror case, e.g. a building in OSM that has since been demolished. */
const SUNNY_FLOOR_PCT = 60;

/** Reports agreeing at or above this count are treated as settled rather than
 *  as one person's opinion; below it the correction is softened. */
const CONSENSUS_COUNT = 3;

export type SunAdjustment =
  | { kind: 'none' }
  | { kind: 'cap'; maxPct: number; reportCount: number }
  | { kind: 'floor'; minPct: number; reportCount: number };

class ReportServiceClass {
  private reports: Report[] = [];

  constructor() {
    this.load();
  }

  private load() {
    try {
      // Guard for non-browser contexts: the venue data module is evaluated by
      // the Vite SSR loader in the verification scripts, where there is no
      // localStorage. Without this the whole data layer throws at import.
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) this.reports = parsed;
      }
    } catch {
      this.reports = [];
    }
  }

  private save() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.reports));
    } catch {
      // Quota exceeded or storage disabled — the in-memory list still works
      // for this session, which is better than failing the user's report.
    }
  }

  submit(venueId: string, type: ReportType): Report {
    const report: Report = {
      id: `report_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      venueId,
      type,
      timestamp: Date.now(),
    };
    this.reports.push(report);
    this.save();
    this.emit(venueId);
    return report;
  }

  // A listener registry rather than a direct call into VenueSunService:
  // VenueSunService already imports this module to adjust its curves, so
  // calling back into it from here would be a circular import.
  private listeners = new Set<(venueId: string) => void>();

  /** Notified whenever a venue's reports change, so caches can be dropped. */
  onChange(listener: (venueId: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(venueId: string): void {
    for (const listener of this.listeners) listener(venueId);
  }

  getReportsForVenue(venueId: string): Report[] {
    return this.reports.filter((r) => r.venueId === venueId);
  }

  getAllReports(): Report[] {
    return [...this.reports];
  }

  /** Reports for a venue that are still within the TTL. */
  private activeReports(venueId: string, now: number): Report[] {
    return this.reports.filter(
      (r) => r.venueId === venueId && now - r.timestamp <= REPORT_TTL_MS
    );
  }

  /**
   * What users collectively say about this venue's sun, expressed as a bound
   * to apply to the computed curve. Returns `none` when reports are absent,
   * expired, contradictory, or irrelevant to sun exposure.
   *
   * `terrace_shaded` and `terrace_sunny` are the only two types that speak to
   * sun exposure. `venue_closed`, `building_missing`, `terrace_missing` and
   * `outdoor_different` are real signals but belong to other parts of the app
   * (opening hours, the OSM dataset, the venue record) and are deliberately
   * ignored here rather than fudged into the sun number.
   */
  getSunAdjustment(venueId: string, now: number = Date.now()): SunAdjustment {
    const active = this.activeReports(venueId, now);
    const shaded = active.filter((r) => r.type === 'terrace_shaded').length;
    const sunny = active.filter((r) => r.type === 'terrace_sunny').length;

    // Disagreement is information too — it says the truth is time-dependent or
    // the venue is borderline. Better to leave the physics alone than to let
    // whichever side reported once more rewrite the day.
    if (shaded === sunny) return { kind: 'none' };

    if (shaded > sunny) {
      const strength = shaded - sunny;
      // A single report softens the ceiling; a consensus applies it fully.
      const maxPct =
        strength >= CONSENSUS_COUNT
          ? SHADED_CEILING_PCT
          : SHADED_CEILING_PCT + ((CONSENSUS_COUNT - strength) / CONSENSUS_COUNT) * (100 - SHADED_CEILING_PCT) * 0.5;
      return { kind: 'cap', maxPct: Math.round(maxPct), reportCount: strength };
    }

    const strength = sunny - shaded;
    const minPct =
      strength >= CONSENSUS_COUNT
        ? SUNNY_FLOOR_PCT
        : SUNNY_FLOOR_PCT * (strength / CONSENSUS_COUNT);
    return { kind: 'floor', minPct: Math.round(minPct), reportCount: strength };
  }

  /**
   * Applies `getSunAdjustment` to a 24h curve. Night hours (already 0) are
   * left alone — a report about shade cannot conjure sun at 03:00, and the
   * floor case must not invent daylight.
   */
  applyToCurve(venueId: string, curve: number[], now: number = Date.now()): number[] {
    const adjustment = this.getSunAdjustment(venueId, now);
    if (adjustment.kind === 'none') return curve;

    return curve.map((pct) => {
      if (pct <= 0) return pct; // night, or already fully shaded
      if (adjustment.kind === 'cap') return Math.min(pct, adjustment.maxPct);
      return Math.max(pct, adjustment.minPct);
    });
  }

  /** Test seam + a way for a future settings screen to let users undo a report. */
  clearForVenue(venueId: string): void {
    this.reports = this.reports.filter((r) => r.venueId !== venueId);
    this.save();
    this.emit(venueId);
  }
}

export const ReportService = new ReportServiceClass();
