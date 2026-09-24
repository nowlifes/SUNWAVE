import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createShadowScheduler, type ShadowJob } from './shadowScheduler';

// Un « calcul d'ombres » factice : `chunks` morceaux, chacun compté.
function fakeBuild(chunks = 4) {
  const built: string[] = [];
  let steps = 0;
  const build = (key: string): ShadowJob<string> => {
    let i = 0;
    return {
      step() {
        steps++;
        i++;
        return i >= chunks;
      },
      result() {
        built.push(key);
        return `ombres@${key}`;
      },
    };
  };
  return { build, built, steps: () => steps };
}

describe('ombres des bâtiments : différées pendant le glissement, justes au relâchement', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('hors glissement : calculées (en morceaux) puis posées', async () => {
    const f = fakeBuild();
    const applied: string[] = [];
    const s = createShadowScheduler({ build: f.build, apply: (k, d) => applied.push(`${k}=${d}`) });
    s.request('16:30', false);
    expect(applied).toEqual([]); // jamais d'un bloc sur le fil principal
    await vi.runAllTimersAsync();
    expect(applied).toEqual(['16:30=ombres@16:30']);
    s.dispose();
  });

  it('pendant le glissement : au plus un calcul par intervalle, et le dernier quart d’heure gagne au relâchement', async () => {
    const f = fakeBuild();
    const applied: string[] = [];
    const s = createShadowScheduler({ build: f.build, apply: (k) => applied.push(k), throttleMs: 300 });
    // 40 pas de curseur en 1 s (un toutes les 25 ms)
    for (let i = 0; i < 40; i++) {
      s.request(`q${i}`, true);
      await vi.advanceTimersByTimeAsync(25);
    }
    // relâché sur le dernier
    s.request('q39', false);
    await vi.runAllTimersAsync();
    expect(applied[applied.length - 1]).toBe('q39');
    // bien moins de calculs que de pas
    expect(f.built.length).toBeLessThanOrEqual(6);
    s.dispose();
  });

  it('un quart d’heure déjà calculé revient sans recalcul', async () => {
    const f = fakeBuild();
    const applied: string[] = [];
    const s = createShadowScheduler({ build: f.build, apply: (k) => applied.push(k) });
    s.request('a', false);
    await vi.runAllTimersAsync();
    s.request('b', false);
    await vi.runAllTimersAsync();
    s.request('a', false);
    expect(applied).toEqual(['a', 'b', 'a']);
    expect(f.built).toEqual(['a', 'b']);
    s.dispose();
  });

  it('le cache est borné', async () => {
    const f = fakeBuild(1);
    const s = createShadowScheduler({ build: f.build, apply: () => {}, cacheSize: 3 });
    for (const k of ['a', 'b', 'c', 'd']) {
      s.request(k, false);
      await vi.runAllTimersAsync();
    }
    s.request('a', false);
    await vi.runAllTimersAsync();
    expect(f.built).toEqual(['a', 'b', 'c', 'd', 'a']);
    s.dispose();
  });

  it('dispose : plus rien n’est posé ni planifié', async () => {
    const f = fakeBuild();
    const applied: string[] = [];
    const s = createShadowScheduler({ build: f.build, apply: (k) => applied.push(k) });
    s.request('x', false);
    s.dispose();
    await vi.runAllTimersAsync();
    expect(applied).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('une erreur de calcul est remontée, pas avalée', async () => {
    const onError = vi.fn();
    const s = createShadowScheduler<string>({
      build: () => ({ step: () => { throw new Error('boum'); }, result: () => '' }),
      apply: () => {},
      onError,
    });
    s.request('x', false);
    await vi.runAllTimersAsync();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'boum' }));
    s.dispose();
  });
});
