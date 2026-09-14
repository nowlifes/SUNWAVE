import type { Report, ReportType } from '@/types';

const STORAGE_KEY = 'sun_reports';

class ReportServiceClass {
  private reports: Report[] = [];

  constructor() {
    this.load();
  }

  private load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.reports = JSON.parse(raw);
    } catch {
      this.reports = [];
    }
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.reports));
    } catch {
      // ignore
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
    return report;
  }

  getReportsForVenue(venueId: string): Report[] {
    return this.reports.filter((r) => r.venueId === venueId);
  }

  getAllReports(): Report[] {
    return [...this.reports];
  }
}

export const ReportService = new ReportServiceClass();
