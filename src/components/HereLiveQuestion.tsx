import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import type { GeoPoint, SunMode, Venue } from '@/types';
import type { LiveAnswer } from '@/services/LiveReportService';
import { liveReports } from '@/services/LiveReportService';
import { VenueService } from '@/services/VenueService';
import { isDaylight, liveThanks } from '@/utils/live';
import { getPseudo, markPseudoAsked, pseudoAsked, setPseudo } from '@/utils/pseudo';
import { LiveQuestion } from './LiveQuestion';

// « Pas maintenant » vaut pour la session, sur tous les écrans : passer d'un
// onglet à l'autre ne doit pas reposer la question qu'on vient d'écarter.
const dismissed = new Set<string>();

interface HereLiveQuestionProps {
  userLocation: GeoPoint;
  locationGranted: boolean;
  mode: SunMode;
  /** Une autre couche occupe déjà le haut de l'écran : la question attend. */
  hidden?: boolean;
}

/** « Il reste des places ? » : posée seulement à qui est vraiment sur place
 *  (position réelle, à moins de 100 m), une fois par lieu tant qu'on n'a pas
 *  répondu ou dit « pas maintenant ». Partagée par Maintenant et la Carte. */
export function HereLiveQuestion({ userLocation, locationGranted, mode, hidden = false }: HereLiveQuestionProps) {
  useSyncExternalStore(
    (cb) => liveReports.subscribe(cb),
    () => liveReports.getVersion()
  );
  const [, setDismissTick] = useState(0);
  // Après le tap : la carte reste 3 s avec ce que la réponse a produit.
  const [justAnswered, setJustAnswered] = useState<{ venue: Venue; answer: LiveAnswer; thanks: string; total: number; askPseudo: boolean } | null>(null);
  const closeThanks = useCallback(() => setJustAnswered(null), []);
  const hereVenue = useMemo(
    () =>
      locationGranted
        ? VenueService.getAllVenues().find((v) => liveReports.isInZone(v, userLocation)) ?? null
        : null,
    [locationGranted, userLocation]
  );
  const askLive =
    hereVenue && isDaylight(new Date()) && !dismissed.has(hereVenue.id) && !liveReports.hasAnswered(hereVenue.id) ? hereVenue : null;

  if (askLive && !hidden) {
    return (
      <LiveQuestion
        venue={askLive}
        mode={mode}
        onAnswer={(answer) => {
          if (!liveReports.submit(askLive, answer, userLocation)) return;
          const agreement = liveReports.getAgreement(askLive.id);
          // Le pseudo n'est demandé qu'une fois, juste après la toute première réponse.
          const askPseudo = !getPseudo() && !pseudoAsked();
          if (askPseudo) markPseudoAsked();
          setJustAnswered({ venue: askLive, answer, thanks: liveThanks(agreement, getPseudo()), total: agreement?.total ?? 1, askPseudo });
        }}
        onDismiss={() => {
          dismissed.add(askLive.id);
          setDismissTick((n) => n + 1);
        }}
      />
    );
  }
  if (justAnswered && !askLive) {
    return (
      <LiveQuestion
        venue={justAnswered.venue}
        mode={mode}
        onAnswer={closeThanks}
        onDismiss={closeThanks}
        answered={justAnswered}
        onDone={closeThanks}
        onPseudo={(pseudo) => {
          if (pseudo) {
            setPseudo(pseudo);
            // Renvoie la même réponse, signée cette fois (le serveur remplace).
            liveReports.submit(justAnswered.venue, justAnswered.answer, userLocation);
          }
          closeThanks();
        }}
      />
    );
  }
  return null;
}
