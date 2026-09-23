import { useState } from 'react';
import type { SunMode } from '@/types';

interface OnboardingProps {
  onComplete: (mode: SunMode) => void;
  onEnableLocation: () => void;
}

export function Onboarding({ onComplete, onEnableLocation }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [selectedMode, setSelectedMode] = useState<SunMode | null>(null);

  if (step === 0) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-between px-8 pt-20 pb-10"
        style={{ background: 'linear-gradient(180deg, #FFF7ED 0%, #F1F5F9 60%, #E2E8F0 100%)' }}
      >
        <div className="text-center">
          <div className="text-5xl mb-6 animate-bounce-in">☀</div>
          <h1 className="text-3xl font-bold text-shade-800 mb-3">
            Soleil ou ombre ?
          </h1>
          <p className="text-sm text-shade-500 max-w-xs mx-auto">
            Le meilleur endroit à Lisbonne, là, maintenant.
          </p>
        </div>

        <div className="w-full max-w-sm space-y-4">
          <button
            onClick={() => { setSelectedMode('SUN'); setStep(1); }}
            className="w-full py-5 rounded-3xl font-bold text-lg text-white active:scale-95 transition-transform shadow-xl"
            style={{ background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)', boxShadow: '0 10px 30px rgba(245,158,11,0.35)' }}
          >
            <span className="text-2xl mr-2">☀</span>
            Soleil
          </button>
          <button
            onClick={() => { setSelectedMode('SHADE'); setStep(1); }}
            className="w-full py-5 rounded-3xl font-bold text-lg text-white active:scale-95 transition-transform shadow-xl"
            style={{ background: 'linear-gradient(135deg, #64748B 0%, #334155 100%)', boxShadow: '0 10px 30px rgba(100,116,139,0.35)' }}
          >
            <span className="text-2xl mr-2">🌑</span>
            Ombre
          </button>
        </div>

        <p className="text-xs text-shade-400">Tu pourras changer à tout moment</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-between px-8 pt-20 pb-10"
      style={{ background: selectedMode === 'SUN'
        ? 'linear-gradient(180deg, #FFF7ED 0%, #F1F5F9 60%, #E2E8F0 100%)'
        : 'linear-gradient(180deg, #F1F5F9 0%, #E2E8F0 60%, #CBD5E1 100%)' }}
    >
      <div className="text-center">
        <div className="text-5xl mb-6 animate-bounce-in">{selectedMode === 'SUN' ? '☀' : '🌑'}</div>
        <h1 className="text-3xl font-bold text-shade-800 mb-3">
          On te trouve le bon coin.
        </h1>
        <p className="text-sm text-shade-500 max-w-xs mx-auto">
          Ta position sert à calculer le temps de marche jusqu'à chaque lieu.
        </p>
      </div>

      <div className="w-full max-w-sm space-y-3">
        <button
          onClick={() => { onEnableLocation(); onComplete(selectedMode!); }}
          className={`w-full py-5 rounded-3xl font-bold text-lg text-white active:scale-95 transition-transform shadow-xl ${
            selectedMode === 'SUN'
              ? 'bg-sun-500 shadow-sun-500/30'
              : 'bg-shade-600 shadow-shade-600/30'
          }`}
        >
          Activer la position
        </button>
        <button
          onClick={() => onComplete(selectedMode!)}
          className="w-full py-3 text-sm font-semibold text-shade-400 active:scale-95 transition-transform"
        >
          Plus tard
        </button>
      </div>

      <p className="text-xs text-shade-400">Pas de compte à créer</p>
    </div>
  );
}
