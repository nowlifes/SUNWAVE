import { useCallback, useEffect, useState } from 'react';
import { browserNeedsInstallHint, pushService, type PushPick } from '@/services/PushService';
import { pickForNextGoldenHour } from '@/services/GoldenHourService';

const DECLINED_KEY = 'sun_notif_declined';
const PICK_DAY_KEY = 'sun_notif_pick_day';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Stockage interdit : la carte pourra être reposée à la prochaine visite, sans conséquence.
  }
}

/** Le lieu de la prochaine notification, calculé ici (le serveur n'a pas les bâtiments). */
function currentPick(): PushPick | null {
  return pickForNextGoldenHour(new Date());
}

/** Renvoie le lieu au serveur, une fois par jour cible, quand l'appareil est déjà abonné. */
function useGoldenPickRefresh() {
  useEffect(() => {
    if (pushService.permission() !== 'granted') return;
    const timer = setTimeout(() => {
      let day: string | null = null;
      void pushService
        .refreshPick(() => {
          const pick = currentPick();
          if (pick && read(PICK_DAY_KEY) === pick.day) return null;
          day = pick?.day ?? null;
          return pick;
        })
        .then((res) => {
          if (res.ok && day) write(PICK_DAY_KEY, day);
          if (!res.ok) console.error('[notifications] mise à jour du lieu :', res.message);
        });
    }, 4000);
    return () => clearTimeout(timer);
  }, []);
}

export type PromptPhase = 'idle' | 'busy' | 'done';

/** La carte « Prévenir quand la golden hour approche ? » : armée après une première
 *  réponse sur place, jamais à l'ouverture, jamais si refusée ou déjà tranchée. */
export function useNotificationPrompt() {
  const [armed, setArmed] = useState(false);
  const [phase, setPhase] = useState<PromptPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(() => read(DECLINED_KEY) === '1');

  useGoldenPickRefresh();

  useEffect(() => {
    if (phase !== 'done') return;
    const t = setTimeout(() => setPhase('idle'), 2500);
    return () => clearTimeout(t);
  }, [phase]);

  const arm = useCallback(() => setArmed(true), []);

  const accept = useCallback(async () => {
    setError(null);
    setPhase('busy');
    const res = await pushService.enable(currentPick);
    if (res.ok) {
      setPhase('done');
    } else {
      setPhase('idle');
      setError(res.message);
    }
  }, []);

  const decline = useCallback(() => {
    write(DECLINED_KEY, '1');
    setDeclined(true);
    setError(null);
  }, []);

  const eligible = armed && !declined && pushService.isSupported() && pushService.permission() === 'default';
  const visible = phase === 'done' || phase === 'busy' || error !== null || eligible;
  return { visible, phase, error, arm, accept, decline };
}

/** L'interrupteur des réglages. */
export function useNotificationSetting() {
  const [supported] = useState(() => pushService.isSupported());
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installHint] = useState(() => browserNeedsInstallHint());

  useEffect(() => {
    let alive = true;
    void pushService.isSubscribed().then((v) => {
      if (alive) setOn(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  const toggle = useCallback(async () => {
    setError(null);
    setBusy(true);
    const res = on ? await pushService.disable() : await pushService.enable(currentPick);
    setBusy(false);
    // L'interrupteur relit l'état réel : il ne ment pas si le serveur a échoué.
    setOn(await pushService.isSubscribed());
    if (!res.ok) setError(res.message);
  }, [on]);

  return { supported, on, busy, error, installHint, toggle };
}
