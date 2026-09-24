// ---------------------------------------------------------------------------
// Les ombres de 11 000 bâtiments coûtaient 2 s de fil principal à chaque pas
// du curseur d'heure (mesuré en CPU x4) : la carte gelait sous le doigt.
//
// Ce planificateur :
//  - découpe le calcul en morceaux (≤ BUDGET_MS par tranche, puis rend la main) ;
//  - pendant le glissement, n'en lance qu'un par `throttleMs` ; le faisceau, les
//    pastilles et le halo, eux, suivent chaque pas (ils ne coûtent rien) ;
//  - au relâchement, calcule le dernier quart d'heure demandé : les ombres
//    affichées sont toujours celles de l'heure affichée une fois le doigt levé ;
//  - garde les derniers quarts d'heure calculés (aller-retour gratuit).
// Pur (minuteurs injectables via l'environnement), testé à part.
// ---------------------------------------------------------------------------

export interface ShadowJob<T> {
  /** Traite un morceau ; `true` quand tout est fait. */
  step(): boolean;
  result(): T;
}

export interface ShadowSchedulerOptions<T> {
  build: (key: string) => ShadowJob<T>;
  apply: (key: string, data: T) => void;
  onError?: (err: Error) => void;
  throttleMs?: number;
  cacheSize?: number;
  budgetMs?: number;
  now?: () => number;
}

export interface ShadowScheduler {
  request(key: string, scrubbing: boolean): void;
  dispose(): void;
}

export function createShadowScheduler<T>({
  build,
  apply,
  onError = (e) => console.error('Ombres des bâtiments :', e),
  throttleMs = 300,
  cacheSize = 8,
  budgetMs = 8,
  now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
}: ShadowSchedulerOptions<T>): ShadowScheduler {
  const cache = new Map<string, T>();
  let wanted: string | null = null;
  let wantedScrub = false;
  let applied: string | null = null;
  let job: { key: string; it: ShadowJob<T> } | null = null;
  let sliceTimer: ReturnType<typeof setTimeout> | null = null;
  let trailing: ReturnType<typeof setTimeout> | null = null;
  let lastStart = -Infinity;
  let disposed = false;

  const show = (key: string, data: T) => {
    if (applied === key) return;
    applied = key;
    apply(key, data);
  };

  const remember = (key: string, data: T) => {
    cache.delete(key);
    cache.set(key, data);
    while (cache.size > cacheSize) cache.delete(cache.keys().next().value as string);
  };

  const cancelJob = () => {
    if (sliceTimer) clearTimeout(sliceTimer);
    sliceTimer = null;
    job = null;
  };

  const run = () => {
    sliceTimer = null;
    if (disposed || !job) return;
    const current = job;
    const t0 = now();
    try {
      for (;;) {
        if (current.it.step()) break;
        if (now() - t0 > budgetMs) {
          sliceTimer = setTimeout(run, 0);
          return;
        }
      }
      const data = current.it.result();
      job = null;
      remember(current.key, data);
      // Même en retard sur le curseur, un calcul fini s'affiche : plus proche
      // de l'heure que les ombres d'avant.
      show(current.key, data);
      if (wanted !== null && wanted !== current.key) request(wanted, wantedScrub);
    } catch (e) {
      job = null;
      onError(e instanceof Error ? e : new Error(String(e)));
    }
  };

  const start = (key: string) => {
    cancelJob();
    lastStart = now();
    job = { key, it: build(key) };
    sliceTimer = setTimeout(run, 0);
  };

  function request(key: string, scrubbing: boolean) {
    if (disposed) return;
    wanted = key;
    wantedScrub = scrubbing;
    const hit = cache.get(key);
    if (hit !== undefined) {
      if (trailing) clearTimeout(trailing);
      trailing = null;
      if (job && job.key !== key && !scrubbing) cancelJob();
      remember(key, hit);
      show(key, hit);
      return;
    }
    if (job?.key === key) return;
    if (!scrubbing) {
      if (trailing) clearTimeout(trailing);
      trailing = null;
      start(key);
      return;
    }
    // Pendant le glissement : un calcul à la fois, et pas plus d'un par intervalle.
    if (job || trailing) return;
    const wait = throttleMs - (now() - lastStart);
    if (wait <= 0) {
      start(key);
      return;
    }
    trailing = setTimeout(() => {
      trailing = null;
      if (wanted !== null) request(wanted, wantedScrub);
    }, wait);
  }

  return {
    request,
    dispose() {
      disposed = true;
      cancelJob();
      if (trailing) clearTimeout(trailing);
      trailing = null;
      cache.clear();
    },
  };
}
