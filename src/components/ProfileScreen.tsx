import { useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react';
import type { SunMode } from '@/types';
import { CYCLE, circadian, textOn } from '@/utils/circadian';
import { PSEUDO_MAX, getPseudo, normalizePseudo, setPseudo, subscribePseudo } from '@/utils/pseudo';
import { getAvatar, subscribeAvatar } from '@/utils/avatar';
import { Avatar } from './Avatar';

interface ProfileScreenProps {
  mode: SunMode;
  onModeChange: (mode: SunMode) => void;
  locationLabel: string;
  locationGranted: boolean;
  currentDate: Date;
}

// La bascule écrit le mode de l'app, pas une préférence à part : elle
// écrivait `preferences.mode`, que rien ne lisait — on touchait « Ombre » et
// l'accueil restait au soleil.
export function ProfileScreen({ mode, onModeChange, locationLabel, locationGranted, currentDate }: ProfileScreenProps) {
  // Cycle circadien : le fond prend la couleur de l'heure (la feuille en
  // Soleil, le haut du ciel en Ombre), comme Maintenant et la barre d'onglets.
  // Le texte posé sur le fond passe en encre ou crème plein : le gris-bleu
  // `day-sub` tombe sous 4.5 sur l'orange de l'heure dorée. Les blocs crème
  // (champ, position) gardent leurs couleurs.
  const cycle = useMemo<CSSProperties | undefined>(() => {
    if (!CYCLE) return undefined;
    const c = circadian(currentDate, mode);
    const bg = mode === 'SUN' ? c.sheet : c.deep;
    const fg = textOn(bg) === 'ink' ? '#0B1A45' : '#FFF1D6';
    return { background: bg, color: fg, '--on-bg-sub': fg, '--on-bg-line': fg } as CSSProperties;
  }, [currentDate, mode]);
  const pseudo = useSyncExternalStore(subscribePseudo, getPseudo);
  const avatar = useSyncExternalStore(subscribeAvatar, getAvatar);
  const [draft, setDraft] = useState(pseudo ?? '');
  const [status, setStatus] = useState<'idle' | 'saved' | 'invalid'>('idle');
  const save = () => {
    if (draft.trim() === '') {
      setPseudo(null);
      setStatus(pseudo ? 'saved' : 'idle');
      return;
    }
    const p = normalizePseudo(draft);
    if (!p) return setStatus('invalid');
    setPseudo(p);
    setDraft(p);
    setStatus('saved');
  };

  return (
    <div className="h-full overflow-y-auto no-scrollbar bg-day pb-24 text-ink [--on-bg-sub:#34487A] [--on-bg-line:#C8D2EA]" style={cycle} data-cycle={cycle ? '' : undefined}>
      <div className="px-6 pt-10 pb-4">
        <h1 className="font-display text-[2.6rem] font-extrabold leading-none tracking-[-0.025em] [font-stretch:90%]">Profil</h1>
      </div>

      {/* Avatar : la silhouette à contre-jour qui s'affiche dans « confirmé par » */}
      <div className="px-6 mb-7">
        <h2 className="mb-3 text-[13px] font-semibold text-[var(--on-bg-sub)]">Ton avatar</h2>
        <div className="flex items-end gap-3">
          <Avatar code={avatar} light="sun" size={120} label="Ton avatar, au soleil" className="-rotate-3" />
          <Avatar code={avatar} light="shade" size={80} label="Ton avatar, au frais" className="rotate-2" />
        </div>
        <p className="mt-3 text-xs leading-snug text-[var(--on-bg-sub)]">
          La même silhouette pour tout le monde : au soleil ou au frais selon le lieu que tu as confirmé.
        </p>
      </div>

      {/* Pseudo : affiché chez les autres quand on confirme un lieu */}
      <div className="px-6 mb-6">
        <label htmlFor="profile-pseudo" className="mb-2 block text-[13px] font-semibold text-[var(--on-bg-sub)]">
          Ton pseudo
        </label>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            id="profile-pseudo"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setStatus('idle');
            }}
            onBlur={save}
            maxLength={PSEUDO_MAX}
            autoComplete="nickname"
            placeholder="Ex. Léa, sunchaser…"
            aria-invalid={status === 'invalid'}
            aria-describedby="profile-pseudo-hint"
            className="min-h-[52px] min-w-0 flex-1 rounded-[16px] border-[1.5px] border-day-line bg-day-2 px-4 text-[15px] font-semibold text-ink outline-none focus:border-ink"
          />
        </form>
        <p id="profile-pseudo-hint" role={status === 'invalid' ? 'alert' : undefined} className={`mt-1.5 text-xs ${status === 'invalid' ? 'font-semibold' : ''} text-[var(--on-bg-sub)]`}>
          {status === 'invalid'
            ? "Lettres, chiffres, espaces et . _ ' - seulement."
            : status === 'saved'
              ? pseudo ? `Enregistré. Les autres verront « confirmé par ${pseudo} ».` : 'Pseudo retiré : tes réponses ne sont plus signées.'
              : 'Signe tes réponses « il reste des places ? ». Un pseudo, pas ton vrai nom.'}
        </p>
      </div>

      {/* Position */}
      <div className="px-6 mb-6">
        <h2 className="mb-2 text-[13px] font-semibold text-[var(--on-bg-sub)]">Position</h2>
        <div className="rounded-[20px] border border-day-line bg-day-2 p-4 text-ink">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-day">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold">{locationLabel}</p>
              <p className="text-xs text-day-sub">
                {locationGranted ? 'Position activée' : 'Temps de marche depuis le centre de Lisbonne'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Ce qu'on cherche */}
      <div className="px-6 mb-6">
        <h2 className="mb-2 text-[13px] font-semibold text-[var(--on-bg-sub)]">Tu cherches</h2>
        <div className="flex gap-3" role="radiogroup" aria-label="Tu cherches">
          {(['SUN', 'SHADE'] as const).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={mode === m}
              onClick={() => onModeChange(m)}
              className={`min-h-[52px] flex-1 rounded-full text-[15px] font-bold transition-colors active:scale-[0.98] motion-reduce:transition-none ${
                mode === m ? 'bg-ink text-white ring-[1.5px] ring-[var(--on-bg-line)]' : 'border-[1.5px] border-[var(--on-bg-line)] text-[var(--on-bg-sub)]'
              }`}
            >
              {m === 'SUN' ? 'Soleil' : 'Ombre'}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 py-4">
        <p className="text-center font-mono text-xs text-[var(--on-bg-sub)]">Sunwave · Lisbonne · v1.0</p>
      </div>
    </div>
  );
}
