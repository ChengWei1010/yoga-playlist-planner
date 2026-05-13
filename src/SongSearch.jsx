import { useState, useEffect, useRef } from 'react';
import { searchTracks, msToMinSec } from './spotify';
import { searchMusicBrainz } from './musicbrainz';

export function SongSearch({ value, token, closeDropdown, onSelect, onChangeDirect }) {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const isFocusedRef = useRef(false);

  // Only sync external value when not focused (e.g. playlist switch, row reset)
  useEffect(() => {
    if (!isFocusedRef.current) setQuery(value || '');
  }, [value]);

  useEffect(() => { if (closeDropdown) setOpen(false); }, [closeDropdown]);

  useEffect(() => {
    if (query.length < 2) {
      clearTimeout(debounceRef.current);
      abortRef.current?.abort();
      setLoading(false);
      setResults([]);
      setOpen(false);
      return;
    }
    clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      let tracks;
      try {
        tracks = token
          ? await searchTracks(query, token)
          : await searchMusicBrainz(query, controller.signal);
      } catch {
        setLoading(false);
        return;
      }
      if (controller.signal.aborted) return;
      if (tracks === null) {
        // Rate limited — keep existing results and open dropdown if we have any
        setLoading(false);
        if (results.length > 0 && isFocusedRef.current) setOpen(true);
        return;
      }
      setResults(tracks || []);
      setLoading(false);
      if (tracks?.length > 0) {
        const rect = inputRef.current?.getBoundingClientRect();
        const spaceBelow = window.innerHeight - (rect?.bottom ?? 0);
        setDropUp(spaceBelow < 280);
        setOpen(true);
      }
    }, 700);
    return () => { clearTimeout(debounceRef.current); };
  }, [query, token]);

  useEffect(() => {
    function handleClick(e) {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleChange(e) {
    const v = e.target.value;
    setQuery(v);
    onChangeDirect(v);
  }

  function handleSelect(track) {
    setQuery(track.name);
    setOpen(false);
    onSelect(track);
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') setOpen(false);
  }

  function handleFocus() {
    isFocusedRef.current = true;
    if (results.length > 0) setOpen(true);
  }

  function handleBlur() {
    setTimeout(() => {
      isFocusedRef.current = false;
      setOpen(false);
    }, 150);
  }

  const placeholder = token ? 'Search Spotify…' : 'Type to search songs…';

  return (
    <div className="song-search" ref={containerRef}>
      <input
        ref={inputRef}
        className="cell-input"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        autoComplete="off"
      />
      {loading && <div className="search-spinner" />}
      {open && (
        <ul className={`search-dropdown${dropUp ? ' drop-up' : ''}`} role="listbox">
          <li className="search-source-label">
            {token ? '🎵 Spotify' : '🎵 MusicBrainz'}
          </li>
          {results.map(track => (
            <li
              key={track.id}
              className="search-item"
              role="option"
              onMouseDown={() => handleSelect(track)}
            >
              {track.albumArt && (
                <img className="track-art" src={track.albumArt} alt="" width="32" height="32" />
              )}
              <div className="track-info">
                <span className="track-name">{track.name}</span>
                <span className="track-artists">{track.artists}</span>
              </div>
              <span className="track-dur">{msToMinSec(track.duration_ms)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
