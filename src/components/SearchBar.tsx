import { useState, useCallback, useRef, useEffect } from 'react';
import type { Venue } from '@/types';
import { VenueService } from '@/services/VenueService';

interface SearchBarProps {
  onSelectVenue: (venue: Venue) => void;
  placeholder?: string;
}

export function SearchBar({ onSelectVenue, placeholder = 'Chercher un lieu' }: SearchBarProps) {
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
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl glass shadow-sm">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          className="flex-1 bg-transparent text-sm font-medium text-shade-700 placeholder:text-shade-400 outline-none"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); }}
            className="w-5 h-5 rounded-full bg-shade-200 flex items-center justify-center"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="3" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {focused && results.length > 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 glass rounded-2xl shadow-lg overflow-hidden z-30 animate-scale-in max-h-64 overflow-y-auto no-scrollbar">
          {results.map((venue) => (
            <button
              key={venue.id}
              onClick={() => handleSelect(venue)}
              className="w-full text-left px-4 py-3 hover:bg-shade-50/50 active:bg-shade-100 border-b border-shade-100/50 last:border-0"
            >
              <p className="text-sm font-semibold text-shade-700">{venue.name}</p>
              <p className="text-xs text-shade-400">{venue.address}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
