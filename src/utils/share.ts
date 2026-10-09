import type { Recommendation, SunMode } from '@/types';
import type { SunTrail } from '@/services/SunTrailService';
import { formatLisbonTime } from './lisbonTime';
import { tr } from './lang';

// ---------------------------------------------------------------------------
// Rendez-vous au soleil — l'invitation qu'on envoie à quelqu'un.
//
// Un « on se voit où ? » reçoit presque toujours un nom de lieu seul. Celui-ci
// arrive avec l'heure où le soleil part : c'est la phrase qu'aucune autre app
// ne peut écrire, et chaque invitation ouvre SUNWAVE sur un téléphone de plus.
// ---------------------------------------------------------------------------

const PARAM = 'lieu';

function until(end: string, sunset: string): string {
  return end === sunset
    ? tr(`jusqu'au coucher (${sunset})`, `until sunset (${sunset})`)
    : tr(`jusqu'à ${end}`, `until ${end}`);
}

/** Le texte de l'invitation. `sunset` en « HH:MM », heure de Lisbonne. */
export function inviteText(rec: Recommendation, mode: SunMode, trail: SunTrail | null, sunset: string): string {
  const isSun = mode === 'SUN';
  const where = isSun ? tr('au soleil', 'in the sun') : tr("à l'ombre", 'in the shade');
  const opener = isSun ? tr('☀ Rendez-vous au soleil ?', '☀ Meet in the sun?') : tr("Rendez-vous à l'ombre ?", 'Meet in the shade?');

  let when: string;
  if (rec.sunLeavesInMin !== null && rec.sunWindowEnd) when = `${where} ${until(rec.sunWindowEnd, sunset)}`;
  else if (rec.sunArrivesInMin !== null && rec.sunWindowStart && !rec.arrivesTomorrow) when = `${where} ${tr('dès', 'from')} ${rec.sunWindowStart}`;
  else when = '';

  // La suite du parcours, quand il y en a une — au moment du départ réel de
  // la première étape (fermeture comprise), pas de la fenêtre brute.
  let next = '';
  if (trail && trail.stops.length > 1) {
    when = `${where} ${tr('jusqu\'à', 'until')} ${formatLisbonTime(trail.stops[0].leaveAt)}`;
    next = trail.stops
      .slice(1)
      .map((s) => `, ${tr('puis', 'then')} ${s.rec.venue.name} ${until(formatLisbonTime(s.leaveAt), sunset)}`)
      .join('');
  }

  return `${opener} ${rec.venue.name}${when ? `, ${when}` : ''}${next}.`;
}

/** L'invitation du moment coucher : un lieu, une minute. */
export function sunsetInviteText(venueName: string, time: string): string {
  return tr(
    `Le soleil plonge dans l'océan à ${time}, vu de ${venueName}. On y va ?`,
    `The sun dips into the ocean at ${time}, seen from ${venueName}. Shall we go?`
  );
}

export function inviteUrl(origin: string, venueId: string): string {
  return `${origin}/?${PARAM}=${encodeURIComponent(venueId)}`;
}

export function venueIdFromUrl(href: string): string | null {
  try {
    return new URL(href).searchParams.get(PARAM);
  } catch {
    return null;
  }
}

/**
 * Feuille de partage native quand le téléphone en a une, sinon le presse-
 * papiers. `cancelled` : l'utilisateur a fermé la feuille — rien à signaler.
 */
export async function shareInvite(text: string, url: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text, url });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // Feuille indisponible (desktop, iframe) : on retombe sur la copie.
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}
