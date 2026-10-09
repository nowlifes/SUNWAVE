import { useState, useSyncExternalStore } from 'react';
import type { SunMode } from '@/types';
import { PSEUDO_MAX, getPseudo, normalizePseudo, setPseudo, subscribePseudo } from '@/utils/pseudo';
import { getAvatar, subscribeAvatar } from '@/utils/avatar';
import { Avatar } from './Avatar';
import { setLang, tr, useLang, type Lang } from '@/utils/lang';

interface ProfileScreenProps {
  mode: SunMode;
  onModeChange: (mode: SunMode) => void;
  locationLabel: string;
  locationGranted: boolean;
}

// La bascule écrit le mode de l'app, pas une préférence à part : elle
// écrivait `preferences.mode`, que rien ne lisait — on touchait « Ombre » et
// l'accueil restait au soleil.
export function ProfileScreen({ mode, onModeChange, locationLabel, locationGranted }: ProfileScreenProps) {
  const pseudo = useSyncExternalStore(subscribePseudo, getPseudo);
  const avatar = useSyncExternalStore(subscribeAvatar, getAvatar);
  const lang = useLang();
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
    <div className="h-full overflow-y-auto no-scrollbar bg-day pb-24 text-ink">
      <div className="px-6 pt-10 pb-4">
        <h1 className="font-display text-[2.6rem] font-extrabold leading-none tracking-[-0.025em] [font-stretch:90%]">{tr('Profil', 'Profile')}</h1>
      </div>

      {/* Langue : en tête, pour qui ne lit pas la langue affichée. Chaque
          option s'écrit dans sa propre langue, et le titre dans les deux. */}
      <div className="px-6 mb-7">
        <h2 id="profile-lang" className="mb-2 text-[13px] font-semibold text-day-sub">Langue · Language</h2>
        <div className="flex gap-3" role="radiogroup" aria-labelledby="profile-lang">
          {([['fr', 'Français'], ['en', 'English']] as [Lang, string][]).map(([l, name]) => (
            <button
              key={l}
              role="radio"
              aria-checked={lang === l}
              lang={l}
              onClick={() => setLang(l)}
              className={`min-h-[52px] flex-1 rounded-full text-[15px] font-bold transition-colors active:scale-[0.98] motion-reduce:transition-none ${
                lang === l ? 'bg-ink text-white' : 'border-[1.5px] border-day-line text-day-sub'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Avatar : la silhouette à contre-jour qui s'affiche dans « confirmé par » */}
      <div className="px-6 mb-7">
        <h2 className="mb-3 text-[13px] font-semibold text-day-sub">{tr('Ton avatar', 'Your avatar')}</h2>
        <div className="flex items-end gap-3">
          <Avatar code={avatar} light="sun" size={120} label={tr('Ton avatar, au soleil', 'Your avatar, in the sun')} className="-rotate-3" />
          <Avatar code={avatar} light="shade" size={80} label={tr('Ton avatar, au frais', 'Your avatar, in the shade')} className="rotate-2" />
        </div>
        <p className="mt-3 text-xs leading-snug text-day-sub">
          {tr(
            'La même silhouette pour tout le monde : au soleil ou au frais selon le lieu que tu as confirmé.',
            'The same silhouette for everyone: in the sun or in the shade, depending on the place you confirmed.'
          )}
        </p>
      </div>

      {/* Pseudo : affiché chez les autres quand on confirme un lieu */}
      <div className="px-6 mb-6">
        <label htmlFor="profile-pseudo" className="mb-2 block text-[13px] font-semibold text-day-sub">
          {tr('Ton pseudo', 'Your nickname')}
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
            placeholder={tr('Ex. Léa, sunchaser…', 'e.g. Léa, sunchaser…')}
            aria-invalid={status === 'invalid'}
            aria-describedby="profile-pseudo-hint"
            className="min-h-[52px] min-w-0 flex-1 rounded-[16px] border-[1.5px] border-day-line bg-day-2 px-4 text-[15px] font-semibold outline-none focus:border-ink"
          />
        </form>
        <p id="profile-pseudo-hint" role={status === 'invalid' ? 'alert' : undefined} className={`mt-1.5 text-xs ${status === 'invalid' ? 'font-semibold text-day-ember' : 'text-day-sub'}`}>
          {status === 'invalid'
            ? tr("Lettres, chiffres, espaces et . _ ' - seulement.", "Letters, numbers, spaces and . _ ' - only.")
            : status === 'saved'
              ? pseudo
                ? tr(`Enregistré. Les autres verront « confirmé par ${pseudo} ».`, `Saved. Others will see “confirmed by ${pseudo}”.`)
                : tr('Pseudo retiré : tes réponses ne sont plus signées.', 'Nickname removed: your answers are no longer signed.')
              : tr(
                  'Signe tes réponses « il reste des places ? ». Un pseudo, pas ton vrai nom.',
                  'Signs your answers to “any seats left?”. A nickname, not your real name.'
                )}
        </p>
      </div>

      {/* Position */}
      <div className="px-6 mb-6">
        <h2 className="mb-2 text-[13px] font-semibold text-day-sub">{tr('Position', 'Location')}</h2>
        <div className="rounded-[20px] border border-day-line bg-day-2 p-4">
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
                {locationGranted
                  ? tr('Position activée', 'Location on')
                  : tr('Temps de marche depuis le centre de Lisbonne', 'Walking times from central Lisbon')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Ce qu'on cherche */}
      <div className="px-6 mb-6">
        <h2 className="mb-2 text-[13px] font-semibold text-day-sub">{tr('Tu cherches', 'You’re after')}</h2>
        <div className="flex gap-3" role="radiogroup" aria-label={tr('Tu cherches', 'You’re after')}>
          {(['SUN', 'SHADE'] as const).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={mode === m}
              onClick={() => onModeChange(m)}
              className={`min-h-[52px] flex-1 rounded-full text-[15px] font-bold transition-colors active:scale-[0.98] motion-reduce:transition-none ${
                mode === m ? 'bg-ink text-white' : 'border-[1.5px] border-day-line text-day-sub'
              }`}
            >
              {m === 'SUN' ? tr('Soleil', 'Sun') : tr('Ombre', 'Shade')}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 py-4">
        <p className="text-center font-mono text-xs text-day-sub">Sunwave · {tr('Lisbonne', 'Lisbon')} · v1.0</p>
      </div>
    </div>
  );
}
