import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { searchTracks, msToMinSec } from './spotify';
import { searchMusicBrainz } from './musicbrainz';

export function SongSearch({ value, token, closeDropdown, onSelect, onChangeDirect, onRateLimit }) {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState([]);
  const [resultSource, setResultSource] = useState('spotify');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0, above: false });
  const debounceRef = useRef(null);
  const abortRef = useRef(null);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const isFocusedRef = useRef(false);

  useEffect(() => {
    if (!isFocusedRef.current) setQuery(value || '');
  }, [value]);

  useEffect(() => { if (closeDropdown) setOpen(false); }, [closeDropdown]);

  function calcDropPos() {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom;
    const above = spaceBelow < 280;
    setDropPos({
      top: above ? rect.top - 4 : rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 320),
      above,
    });
  }

  useEffect(() => {
    if (query.length < 3) {
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
      if (tracks?.rateLimited) {
        // Spotify rate limited — fall back to MusicBrainz
        onRateLimit?.(tracks.retryAfter);
        try {
          const fallback = await searchMusicBrainz(query, controller.signal);
          if (controller.signal.aborted) return;
          if (fallback?.length > 0) {
            setResults(fallback);
            setResultSource('musicbrainz');
            setLoading(false);
            calcDropPos();
            setOpen(true);
            return;
          }
        } catch {}
        setLoading(false);
        if (results.length > 0 && isFocusedRef.current) setOpen(true);
        return;
      }
      setResults(tracks || []);
      setResultSource(token ? 'spotify' : 'musicbrainz');
      setLoading(false);
      if (tracks?.length > 0) {
        calcDropPos();
        setOpen(true);
      }
    }, 900);
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
    if (results.length > 0) { calcDropPos(); setOpen(true); }
  }

  function handleBlur() {
    setTimeout(() => {
      isFocusedRef.current = false;
      setOpen(false);
    }, 150);
  }

  const placeholder = token ? 'Search Spotify…' : 'Type to search songs…';

  const dropdown = open && createPortal(
    <ul
      className="search-dropdown"
      role="listbox"
      style={{
        position: 'fixed',
        top: dropPos.above ? 'auto' : dropPos.top,
        bottom: dropPos.above ? window.innerHeight - dropPos.top : 'auto',
        left: dropPos.left,
        width: dropPos.width,
        zIndex: 9999,
      }}
    >
      <li className="search-source-label">
        {resultSource === 'spotify' ? '🎵 Spotify' : '🎵 MusicBrainz'}
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
    </ul>,
    document.body
  );

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
      {dropdown}
    </div>
  );
}
