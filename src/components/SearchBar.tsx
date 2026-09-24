import { useState, useCallback, useRef, useEffect } from 'react';
import type { Venue } from '@/types';
import { VenueService } from '@/services/VenueService';

interface SearchBarProps {
  onSelectVenue: (venue: Venue) => void;
  placeholder?: string;
  /** Sur la carte de nuit : champ et résultats opaques, encre claire. */
  tone?: 'day' | 'night';
}

export function SearchBar({ onSelectVenue, placeholder = 'Chercher un lieu', tone = 'day' }: SearchBarProps) {
  const night = tone === 'night';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Venue[]>([]);
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setResults(VenueService.search(query).slice(0, 8));
    }, 200);
  }, [query]);

  const handleSelect = useCallback((venue: Venue) => {
    onSelectVenue(venue);
    setQuery('');
    setResults([]);
    setFocused(false);
  }, [onSelectVenue]);

  return (
    <div className="relative">
      <div className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl ${night ? 'min-h-11 border border-dusk-line bg-dusk-panel' : 'min-h-11 border border-day-line bg-day-2'}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={night ? '#AFC0E8' : '#34487A'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          placeholder={placeholder}
          className={`flex-1 bg-transparent text-sm font-medium outline-none ${night ? 'text-dusk-shell placeholder:text-dusk-dim' : 'text-ink placeholder:text-day-sub'}`}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); }}
            aria-label="Effacer"
            className={`-mr-3 flex h-11 w-11 items-center justify-center ${night ? 'text-dusk-sub' : 'text-day-sub'}`}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {focused && results.length > 0 && (
        <div className={`absolute ${night ? 'bottom-full mb-1 border border-dusk-line bg-dusk-panel' : 'top-full mt-1 border border-day-line bg-day'} left-0 right-0 rounded-2xl shadow-lg overflow-hidden z-30 animate-scale-in max-h-64 overflow-y-auto no-scrollbar`}>
          {results.map((venue) => (
            <button
              key={venue.id}
              onClick={() => handleSelect(venue)}
              className={`w-full text-left px-4 py-3 border-b last:border-0 ${night ? 'border-dusk-line active:bg-dusk-cobalt' : 'border-day-line active:bg-day-2'}`}
            >
              <p className={`text-sm font-semibold ${night ? 'text-dusk-shell' : 'text-ink'}`}>{venue.name}</p>
              <p className={`text-xs ${night ? 'text-dusk-sub' : 'text-day-sub'}`}>{venue.address}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
