import { useState, useCallback, useEffect, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { SortableRow } from './SortableRow';
import { defaultRows, parseSongMin, formatTotalTime, BUCKET_COLORS } from './data';
import { startLogin, handleCallback, getToken, logout, getSpotifyUser, fetchPlaylist, msToMinSec } from './spotify';
import { cloudLoad, cloudSavePlaylist, cloudSaveIndex, cloudDeletePlaylist, cloudSaveBuckets } from './firebase';
import './App.css';

let nextId = 100;

// ─── Bucket storage ───
const DEFAULT_BUCKETS = [
  { name: 'Intro',            color: 'blue'   },
  { name: 'Integration',      color: 'blue'   },
  { name: 'Sun A',            color: 'yellow' },
  { name: 'Sun B',            color: 'yellow' },
  { name: 'Cardio',           color: 'pink'   },
  { name: 'Core',             color: 'orange' },
  { name: 'Squat',            color: 'orange' },
  { name: 'Balance',          color: 'yellow' },
  { name: 'Hip',              color: 'orange' },
  { name: 'Stretch (Seated)', color: 'teal'   },
  { name: 'Stretch (Belly)',  color: 'teal'   },
  { name: 'Stretch (Back)',   color: 'teal'   },
  { name: 'Cool down',        color: 'blue'   },
  { name: 'Surrender',        color: 'teal'   },
  { name: 'Savasana',         color: 'teal'   },
  { name: 'Ending',           color: 'teal'   },
];
const BUCKETS_KEY = 'yoga_planner_buckets';
function loadBuckets() {
  try {
    const stored = JSON.parse(localStorage.getItem(BUCKETS_KEY));
    if (!stored) return DEFAULT_BUCKETS;
    // Migrate old string[] format
    const normalized = typeof stored[0] === 'string' ? stored.map(name => ({ name, color: null })) : stored;
    // Merge in any DEFAULT_BUCKETS not already present
    const storedNames = new Set(normalized.map(b => b.name));
    const missing = DEFAULT_BUCKETS.filter(b => !storedNames.has(b.name));
    return missing.length ? [...normalized, ...missing] : normalized;
  } catch { return DEFAULT_BUCKETS; }
}
function saveBuckets(buckets) {
  localStorage.setItem(BUCKETS_KEY, JSON.stringify(buckets));
}

// ─── Storage helpers ───
function loadIndex() {
  try { return JSON.parse(localStorage.getItem('yoga_planner_index')) || []; } catch { return []; }
}
function loadPlaylist(id) {
  try { return JSON.parse(localStorage.getItem(`yoga_planner_playlist_${id}`)); } catch { return null; }
}
function savePlaylistToStorage(id, rows, playlistName) {
  localStorage.setItem(`yoga_planner_playlist_${id}`, JSON.stringify({ rows, playlistName, updatedAt: Date.now() }));
  const index = loadIndex();
  const existing = index.find(p => p.id === id);
  if (existing) { existing.name = playlistName; existing.updatedAt = Date.now(); }
  else index.push({ id, name: playlistName, updatedAt: Date.now() });
  localStorage.setItem('yoga_planner_index', JSON.stringify(index));
}
function deletePlaylistFromStorage(id) {
  localStorage.removeItem(`yoga_planner_playlist_${id}`);
  const index = loadIndex().filter(p => p.id !== id);
  localStorage.setItem('yoga_planner_index', JSON.stringify(index));
}

function recalcNextId(rows) {
  const maxId = rows.reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0);
  if (maxId >= nextId) nextId = maxId + 1;
}

function initStorage() {
  // Migrate old single-playlist data
  const old = localStorage.getItem('yoga_planner_data');
  if (old && !loadIndex().length) {
    try {
      const { rows, playlistName } = JSON.parse(old);
      const id = String(Date.now());
      savePlaylistToStorage(id, rows, playlistName || 'New Playlist');
      localStorage.setItem('yoga_planner_active', id);
      localStorage.removeItem('yoga_planner_data');
    } catch {}
  }

  let index = loadIndex();
  let activeId = localStorage.getItem('yoga_planner_active');

  if (!index.length || !activeId || !index.find(p => p.id === activeId)) {
    activeId = String(Date.now());
    const newRows = defaultRows.map(r => ({ ...r, id: String(++nextId) }));
    savePlaylistToStorage(activeId, newRows, 'New Playlist');
    localStorage.setItem('yoga_planner_active', activeId);
    index = loadIndex();
  }

  const playlist = loadPlaylist(activeId);
  if (playlist?.rows) recalcNextId(playlist.rows);

  return { activeId, playlist, index };
}

const { activeId: initialActiveId, playlist: initialPlaylist, index: initialIndex } = initStorage();

function SortableBucketItem({ bucket, idx, onRename, onColorChange, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: bucket.name });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <li ref={setNodeRef} style={style} className="bucket-edit-item">
      <button className="bucket-drag-handle" {...attributes} {...listeners} tabIndex={-1}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="4" cy="3" r="1" fill="#A2B2BF"/><circle cx="4" cy="6" r="1" fill="#A2B2BF"/><circle cx="4" cy="9" r="1" fill="#A2B2BF"/>
          <circle cx="8" cy="3" r="1" fill="#A2B2BF"/><circle cx="8" cy="6" r="1" fill="#A2B2BF"/><circle cx="8" cy="9" r="1" fill="#A2B2BF"/>
        </svg>
      </button>
      <input className="bucket-edit-input" value={bucket.name} onChange={e => onRename(idx, e.target.value)} />
      <div className="color-swatches">
        {[null, ...Object.keys(BUCKET_COLORS)].map(colorKey => {
          const isSelected = bucket.color === colorKey;
          const colorDef = colorKey ? BUCKET_COLORS[colorKey] : null;
          return (
            <button
              key={colorKey ?? 'none'}
              className={`color-swatch${isSelected ? ' selected' : ''}`}
              style={colorDef ? { background: colorDef.bg, borderColor: colorDef.text } : {}}
              onClick={() => onColorChange(idx, colorKey)}
              title={colorKey ?? 'No color'}
            >
              {isSelected && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5l2.5 2.5L8 3" stroke={colorDef ? colorDef.text : '#64748b'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          );
        })}
      </div>
      <button className="del-btn bucket-edit-remove" onClick={() => onRemove(idx)} title="Remove">×</button>
    </li>
  );
}

export default function App() {
  const [rows, setRows] = useState(initialPlaylist?.rows ?? defaultRows.map(r => ({ ...r, id: String(++nextId) })));
  const [playlistName, setPlaylistName] = useState(initialPlaylist?.playlistName ?? 'New Playlist');
  const [activePlaylistId, setActivePlaylistId] = useState(initialActiveId);
  const [playlistIndex, setPlaylistIndex] = useState(initialIndex);
  const [showSidebar, setShowSidebar] = useState(false);
  const [isDragging, setIsDragging] = useState(0);
  const [token, setToken] = useState(() => getToken());
  const [spotifyUser, setSpotifyUser] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importError, setImportError] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [exportedUrl, setExportedUrl] = useState('');
  const [deletePlaylistConfirm, setDeletePlaylistConfirm] = useState(null);
  const [bucketOptions, setBucketOptions] = useState(loadBuckets);
  const [showBucketModal, setShowBucketModal] = useState(false);
  const [bucketDraft, setBucketDraft] = useState([]);
  const [newBucketName, setNewBucketName] = useState('');
  const [viewMode, setViewMode] = useState(false);
  const fileInputRef = useRef(null);
  const cloudSaveRef = useRef(null);

  // Auto-save to localStorage; debounce cloud save when logged in
  useEffect(() => {
    savePlaylistToStorage(activePlaylistId, rows, playlistName);
    setPlaylistIndex(loadIndex());
    const uid = spotifyUser?.id;
    if (!uid) return;
    clearTimeout(cloudSaveRef.current);
    cloudSaveRef.current = setTimeout(() => {
      cloudSavePlaylist(uid, activePlaylistId, { rows, playlistName, updatedAt: Date.now() });
      cloudSaveIndex(uid, loadIndex());
    }, 2000);
  }, [rows, playlistName, activePlaylistId, spotifyUser]);

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      window.history.replaceState({}, '', import.meta.env.BASE_URL);
      handleCallback(code)
        .then(t => setToken(t))
        .catch(err => console.error('Spotify auth failed:', err));
    }
  }, []);

  // Fetch user profile once we have a token; merge cloud data on login (cloud wins only if newer)
  useEffect(() => {
    if (!token) { setSpotifyUser(null); return; }
    getSpotifyUser(token).then(async u => {
      setSpotifyUser(u);
      if (!u?.id) return;
      const cloud = await cloudLoad(u.id);
      if (!cloud?.index?.length) return;

      const localIndex = loadIndex();

      // Merge: for each playlist, keep whichever version (local or cloud) is newer
      cloud.index.forEach(({ id }) => {
        const cloudPl = cloud.playlists?.[id];
        if (!cloudPl) return;
        const localRaw = localStorage.getItem(`yoga_planner_playlist_${id}`);
        const localPl = localRaw ? JSON.parse(localRaw) : null;
        // Keep cloud only if local doesn't exist, or local has a timestamp and cloud is newer
        const cloudNewer = !localPl || (localPl.updatedAt !== undefined && (cloudPl.updatedAt || 0) > localPl.updatedAt);
        if (cloudNewer) {
          localStorage.setItem(`yoga_planner_playlist_${id}`, JSON.stringify({ rows: cloudPl.rows, playlistName: cloudPl.playlistName, updatedAt: cloudPl.updatedAt }));
        }
      });

      // Add any playlists from cloud that don't exist locally
      const localIds = new Set(localIndex.map(p => p.id));
      const mergedIndex = [...localIndex];
      cloud.index.forEach(entry => {
        if (!localIds.has(entry.id)) mergedIndex.push(entry);
      });
      localStorage.setItem('yoga_planner_index', JSON.stringify(mergedIndex));

      const currentId = localStorage.getItem('yoga_planner_active');
      const activeId = mergedIndex.find(p => p.id === currentId)?.id ?? mergedIndex[0]?.id;
      if (!activeId) return;
      localStorage.setItem('yoga_planner_active', activeId);
      const activePl = JSON.parse(localStorage.getItem(`yoga_planner_playlist_${activeId}`) || 'null');
      if (activePl) {
        recalcNextId(activePl.rows);
        setRows(activePl.rows);
        setPlaylistName(activePl.playlistName);
        setActivePlaylistId(activeId);
      }
      if (cloud.buckets?.length) {
        localStorage.setItem(BUCKETS_KEY, JSON.stringify(cloud.buckets));
        setBucketOptions(cloud.buckets);
      }
      setPlaylistIndex(mergedIndex);
    });
  }, [token]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event) {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setRows(items => {
        const oldIndex = items.findIndex(r => r.id === active.id);
        const newIndex = items.findIndex(r => r.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

  const handleUpdate = useCallback((id, field, value) => {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      if (field === 'bucket' && value) return { ...r, [field]: value, isBucketHeader: false };
      return { ...r, [field]: value };
    }));
  }, []);

  const handleDelete = useCallback((id) => {
    setRows(prev => prev.filter(r => r.id !== id));
  }, []);

  const handleAddBelow = useCallback((id) => {
    const newRow = { id: String(++nextId), bucket: '', bucketTime: '', song: '', songMin: '', posture: '', status: 'draft' };
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === id);
      const next = [...prev];
      next.splice(idx + 1, 0, newRow);
      return next;
    });
  }, []);

  const handleAddSongToBucket = useCallback((id) => {
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === id);
      let insertAt = idx;
      for (let i = idx + 1; i < prev.length; i++) {
        if (prev[i].bucket === '') insertAt = i;
        else break;
      }
      const newRow = { id: String(++nextId), bucket: '', bucketTime: '', song: '', songMin: '', posture: '', status: 'draft' };
      const next = [...prev];
      next.splice(insertAt + 1, 0, newRow);
      return next;
    });
  }, []);

  function handleAddRow() {
    setRows(prev => [...prev, { id: String(++nextId), bucket: '', bucketTime: '', song: '', songMin: '', posture: '', status: 'draft', isBucketHeader: true }]);
  }

  function handleLogout() {
    logout();
    setToken(null);
    setSpotifyUser(null);
  }

  // ─── Playlist management ───
  function handleSwitchPlaylist(id) {
    const pl = loadPlaylist(id);
    if (!pl) return;
    setRows(pl.rows);
    setPlaylistName(pl.playlistName);
    setActivePlaylistId(id);
    localStorage.setItem('yoga_planner_active', id);
    recalcNextId(pl.rows);
    setShowSidebar(false);
  }

  function handleNewPlaylist() {
    const id = String(Date.now());
    const newRows = defaultRows.map(r => ({ ...r, id: String(++nextId) }));
    savePlaylistToStorage(id, newRows, 'New Playlist');
    localStorage.setItem('yoga_planner_active', id);
    setRows(newRows);
    setPlaylistName('New Playlist');
    setActivePlaylistId(id);
    setPlaylistIndex(loadIndex());
    setShowSidebar(false);
  }

  function handleDeletePlaylist(id, e) {
    e.stopPropagation();
    if (playlistIndex.length <= 1) return;
    const pl = playlistIndex.find(p => p.id === id);
    setDeletePlaylistConfirm({ id, name: pl?.name || 'this playlist' });
  }

  function confirmDeletePlaylist() {
    const { id } = deletePlaylistConfirm;
    deletePlaylistFromStorage(id);
    const newIndex = loadIndex();
    setPlaylistIndex(newIndex);
    setDeletePlaylistConfirm(null);
    if (spotifyUser?.id) {
      cloudDeletePlaylist(spotifyUser.id, id);
      cloudSaveIndex(spotifyUser.id, newIndex);
    }
    if (id === activePlaylistId) handleSwitchPlaylist(newIndex[0].id);
  }

  // ─── Save / Load JSON ───
  function handleSaveJSON() {
    const blob = new Blob([JSON.stringify({ playlistName, rows }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${playlistName.replace(/[^a-z0-9]/gi, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleLoadJSON(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { rows: newRows, playlistName: newName } = JSON.parse(ev.target.result);
        const id = String(Date.now());
        recalcNextId(newRows);
        savePlaylistToStorage(id, newRows, newName || 'Loaded Playlist');
        localStorage.setItem('yoga_planner_active', id);
        setRows(newRows);
        setPlaylistName(newName || 'Loaded Playlist');
        setActivePlaylistId(id);
        setPlaylistIndex(loadIndex());
        setShowSidebar(false);
      } catch { alert('Invalid file — please load a valid playlist JSON.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // ─── Export URIs ───
  async function handleExport() {
    const uris = rows.map(r => r.spotifyUri).filter(Boolean);
    if (uris.length === 0) { alert('No Spotify tracks to export. Import a playlist or select songs from Spotify search first.'); return; }
    try {
      await navigator.clipboard.writeText(uris.join('\n'));
      setExportedUrl('copied');
    } catch {
      setExportedUrl(uris.join('\n'));
    }
  }

  async function handleImport() {
    if (!token) { setImportError('Connect Spotify first to import a playlist.'); return; }
    const match = importUrl.match(/playlist\/([A-Za-z0-9]+)/);
    if (!match) { setImportError('Paste a valid Spotify playlist URL.'); return; }
    setImportLoading(true);
    setImportError('');
    const result = await fetchPlaylist(match[1], token);
    setImportLoading(false);
    if (!result) {
      setImportError('Could not fetch playlist. Try signing out and reconnecting Spotify.');
      return;
    }
    const { name: importedName, tracks } = result;
    const id = String(Date.now());
    const newRows = tracks.map(t => ({
      id: String(++nextId),
      bucket: '',
      bucketTime: '',
      song: t.name,
      songMin: msToMinSec(t.duration_ms),
      posture: '',
      status: 'draft',
      isBucketHeader: true,
      trackArtists: t.artists,
      spotifyUri: t.uri,
      previewUrl: t.previewUrl || null,
    }));
    savePlaylistToStorage(id, newRows, importedName);
    localStorage.setItem('yoga_planner_active', id);
    setRows(newRows);
    setPlaylistName(importedName);
    setActivePlaylistId(id);
    setPlaylistIndex(loadIndex());
    setShowImportModal(false);
    setImportUrl('');
  }

  function handleReset() {
    const newRows = defaultRows.map(r => ({ ...r, id: String(++nextId) }));
    setRows(newRows);
    setPlaylistName('New Playlist');
    setShowResetConfirm(false);
  }

  // ─── Lock screen export ───
  const CANVAS_ACCENT = {
    blue:   '#5ba8f5',
    orange: '#f59342',
    pink:   '#f472b6',
    yellow: '#fbbf24',
    purple: '#a78bfa',
    teal:   '#2dd4bf',
  };

  function handleDownloadLockScreen() {
    const W = 1179, H = 2556;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0d0d14';
    ctx.fillRect(0, 0, W, H);

    const PAD_X = 135;
    const TOP_SAFE = 720;  // just below clock (~28% down)
    const BOT_SAFE = 1590; // just above music widget (~62% down)
    const contentW = W - PAD_X * 2;

    // Group rows by bucket
    const groups = [];
    rows.forEach(row => {
      const posture = row.posture?.trim();
      if (row.isBucketHeader) {
        const bucketDef = bucketOptions.find(b => b.name === row.bucket);
        const color = bucketDef?.color ? (CANVAS_ACCENT[bucketDef.color] || 'rgba(255,255,255,0.6)') : 'rgba(255,255,255,0.6)';
        groups.push({ bucket: row.bucket || '—', color, postures: posture ? [posture] : [] });
      } else if (groups.length && posture) {
        groups[groups.length - 1].postures.push(posture);
      }
    });

    function wrapText(text, maxW, font) {
      ctx.font = font;
      const words = text.split(/\s+/);
      const lines = [];
      let line = '';
      for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
        else line = test;
      }
      if (line) lines.push(line);
      return lines;
    }

    // Playlist name label removed

    const BUCKET_FONT = '700 28px -apple-system, BlinkMacSystemFont, sans-serif';
    const POSTURE_FONT = '500 23px -apple-system, BlinkMacSystemFont, sans-serif';

    let y = TOP_SAFE;
    for (const group of groups) {
      if (y >= BOT_SAFE) break;
      // Colored dot
      ctx.beginPath();
      ctx.arc(PAD_X + 6, y - 7, 5, 0, Math.PI * 2);
      ctx.fillStyle = group.color;
      ctx.fill();
      // Bucket name
      ctx.font = BUCKET_FONT;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(group.bucket, PAD_X + 22, y);
      y += 42;
      // Postures
      for (const posture of group.postures) {
        for (const seg of posture.split('\n')) {
          const trimmed = seg.trim();
          if (!trimmed) continue;
          for (const line of wrapText(trimmed, contentW - 24, POSTURE_FONT)) {
            if (y >= BOT_SAFE) break;
            ctx.font = POSTURE_FONT;
            ctx.fillStyle = 'rgba(255,255,255,0.82)';
            ctx.fillText(line, PAD_X + 22, y);
            y += 32;
          }
        }
      }
      y += 22;
    }

    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    }, 'image/png');
  }

  // ─── Bucket manager ───
  function handleOpenBucketModal() {
    setBucketDraft(bucketOptions.map(b => ({ ...b })));
    setNewBucketName('');
    setShowBucketModal(true);
  }
  function handleRenameBucket(idx, value) {
    setBucketDraft(d => d.map((b, i) => i === idx ? { ...b, name: value } : b));
  }
  function handleBucketColor(idx, color) {
    setBucketDraft(d => d.map((b, i) => i === idx ? { ...b, color } : b));
  }
  function handleRemoveBucket(idx) {
    setBucketDraft(d => d.filter((_, i) => i !== idx));
  }
  function handleBucketDragEnd(event) {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setBucketDraft(d => {
        const oldIndex = d.findIndex(b => b.name === active.id);
        const newIndex = d.findIndex(b => b.name === over.id);
        return arrayMove(d, oldIndex, newIndex);
      });
    }
  }
  function handleAddBucket() {
    const name = newBucketName.trim();
    if (!name || bucketDraft.some(b => b.name === name)) return;
    setBucketDraft(d => [...d, { name, color: null }]);
    setNewBucketName('');
  }
  function handleSaveBuckets() {
    const clean = bucketDraft.map(b => ({ ...b, name: b.name.trim() })).filter(b => b.name);
    setBucketOptions(clean);
    saveBuckets(clean);
    if (spotifyUser?.id) cloudSaveBuckets(spotifyUser.id, clean);
    setShowBucketModal(false);
  }

  const totalSeconds = rows.reduce((sum, r) => sum + parseSongMin(r.songMin), 0);
  const songCount = rows.filter(r => r.songMin && r.songMin.trim()).length;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <button className="sidebar-toggle" onClick={() => setShowSidebar(s => !s)} title="Playlists">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div className="logo-mark">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="15" fill="#e8edf0" stroke="#A2B2BF" strokeWidth="1.5"/>
              <path d="M12 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" fill="#A2B2BF"/>
              <path d="M15 19V9l8-2v10" stroke="#A2B2BF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="23" cy="19" r="3" fill="#A2B2BF"/>
            </svg>
          </div>
          <div className="header-title-group">
            <span className="app-label">Yoga Music Planner</span>
            <input
              className="playlist-name"
              value={playlistName}
              onChange={e => setPlaylistName(e.target.value)}
              placeholder="New Playlist"
              aria-label="Playlist name"
            />
          </div>
        </div>

        <div className="header-right">
          <div className="mode-toggle">
            <button className={`mode-btn${!viewMode ? ' mode-active' : ''}`} onClick={() => setViewMode(false)}>Edit</button>
            <button className={`mode-btn${viewMode ? ' mode-active' : ''}`} onClick={() => setViewMode(true)}>View</button>
          </div>
          {viewMode && (
            <button className="lockscreen-btn" onClick={handleDownloadLockScreen} title="Download as iPhone lock screen">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18.5" strokeWidth="2.5"/>
              </svg>
              Download as image
            </button>
          )}
          <button className="gear-btn" onClick={handleOpenBucketModal} title="Manage buckets">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
          </button>
          {!viewMode && <button className="reset-btn" onClick={() => setShowResetConfirm(true)}>Reset</button>}
          <button className="import-btn" onClick={() => { setShowImportModal(true); setImportError(''); setImportUrl(''); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Import
          </button>
          {token && (
            <button className="export-btn" onClick={handleExport}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 5 17 10"/><line x1="12" y1="5" x2="12" y2="17"/>
              </svg>
              Export URIs
            </button>
          )}
          {token ? (
            <div className="spotify-user">
              {spotifyUser?.images?.[0]?.url ? (
                <img className="spotify-avatar" src={spotifyUser.images[0].url} alt={spotifyUser.display_name} />
              ) : (
                <div className="spotify-avatar-fallback">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                    <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 3a3 3 0 110 6 3 3 0 010-6zm0 14.2a7.2 7.2 0 01-6-3.22c.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08a7.2 7.2 0 01-6 3.22z"/>
                  </svg>
                </div>
              )}
              <div className="spotify-user-info">
                <span className="spotify-connected">Connected to Spotify</span>
                <span className="spotify-name">{spotifyUser?.display_name || '…'}</span>
              </div>
              <button className="spotify-logout-btn" onClick={handleLogout}>Sign out</button>
            </div>
          ) : (
            <button className="spotify-login-btn" onClick={startLogin}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
              </svg>
              Connect Spotify
            </button>
          )}
        </div>
      </header>

      {!token && (
        <div className="spotify-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#1a7fbf">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
          </svg>
          Song search is powered by MusicBrainz. Connect Spotify for richer results with album art.
        </div>
      )}

      <div className="app-body">
        {/* ─── Sidebar ─── */}
        {showSidebar && <div className="sidebar-backdrop" onClick={() => setShowSidebar(false)} />}
        <aside className={`sidebar${showSidebar ? ' open' : ''}`}>
          <div className="sidebar-header">
            <span className="sidebar-title">Playlists</span>
            <button className="sidebar-close" onClick={() => setShowSidebar(false)}>×</button>
          </div>
          <button className="sidebar-new-btn" onClick={handleNewPlaylist}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            New Playlist
          </button>
          <ul className="sidebar-list">
            {[...playlistIndex].sort((a, b) => b.updatedAt - a.updatedAt).map(p => (
              <li
                key={p.id}
                className={`sidebar-item${p.id === activePlaylistId ? ' active' : ''}`}
                onClick={() => handleSwitchPlaylist(p.id)}
              >
                <span className="sidebar-item-name">{p.name}</span>
                {playlistIndex.length > 1 && (
                  <button className="sidebar-delete-btn" onClick={(e) => handleDeletePlaylist(p.id, e)} title="Delete">×</button>
                )}
              </li>
            ))}
          </ul>
          <div className="sidebar-footer">
            <button className="sidebar-action-btn" onClick={handleSaveJSON}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Save JSON
            </button>
            <label className="sidebar-action-btn sidebar-load-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 5 17 10"/><line x1="12" y1="5" x2="12" y2="17"/>
              </svg>
              Load JSON
              <input ref={fileInputRef} type="file" accept=".json" onChange={handleLoadJSON} style={{display:'none'}} />
            </label>
          </div>
        </aside>

        <main className="table-wrapper">
          <table className="playlist-table">
            <thead>
              <tr>
                {!viewMode && <th className="th-drag" aria-label="Reorder"></th>}
                <th className="th-bucket">Bucket</th>
                <th className="th-time">Time</th>
                <th className="th-song">Song</th>
                <th className="th-songmin">Song length</th>
                <th className="th-posture">Posture</th>
                {!viewMode && <th className="th-status">Status</th>}
                {!viewMode && <th className="th-actions" aria-label="Actions"></th>}
              </tr>
            </thead>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={() => setIsDragging(n => n + 1)}
              onDragEnd={e => { handleDragEnd(e); }}
              modifiers={[restrictToVerticalAxis]}
            >
              <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
                <tbody>
                  {rows.map((row, index) => {
                    let isContinuation = false;
                    let parentBucket = '';
                    if (!row.bucket && !row.isBucketHeader && index > 0) {
                      const prev = rows[index - 1];
                      if (prev.bucket) {
                        isContinuation = true;
                        parentBucket = prev.bucket;
                      } else if (!prev.isBucketHeader) {
                        for (let i = index - 1; i >= 0; i--) {
                          if (rows[i].isBucketHeader) break;
                          if (rows[i].bucket) { isContinuation = true; parentBucket = rows[i].bucket; break; }
                        }
                      }
                    }

                    let bucketTotalTime = '';
                    if (!isContinuation) {
                      let totalSec = parseSongMin(row.songMin);
                      for (let i = index + 1; i < rows.length; i++) {
                        if (rows[i].bucket || rows[i].isBucketHeader) break;
                        totalSec += parseSongMin(rows[i].songMin);
                      }
                      if (totalSec > 0) {
                        const m = Math.floor(totalSec / 60);
                        const s = totalSec % 60;
                        bucketTotalTime = s > 0 ? `${m}m ${s}s` : `${m} mins`;
                      }
                    }

                    return (
                      <SortableRow
                        key={row.id}
                        row={row}
                        index={index}
                        token={token}
                        isContinuation={isContinuation}
                        parentBucket={parentBucket}
                        bucketTotalTime={bucketTotalTime}
                        bucketOptions={bucketOptions}
                        isDraggingList={isDragging}
                        onUpdate={handleUpdate}
                        onDelete={handleDelete}
                        onAddBelow={handleAddBelow}
                        onAddSongToBucket={handleAddSongToBucket}
                        viewMode={viewMode}
                      />
                    );
                  })}
                </tbody>
              </SortableContext>
            </DndContext>
          </table>
          {!viewMode && (
          <div className="table-footer-actions">
            <button className="add-bucket-btn" onClick={handleAddRow}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Add Bucket
            </button>
          </div>
          )}
        </main>
      </div>

      <footer className="app-footer">
        <div className="footer-inner">
          <div className="footer-label">Playlist Summary</div>
          <div className="footer-stats">
            <div className="stat-item">
              <span className="stat-num">{rows.length}</span>
              <span className="stat-desc">total songs</span>
            </div>
            <div className="stat-sep" />
            <div className="stat-item">
              <span className="stat-num">{songCount}</span>
              <span className="stat-desc">timed songs</span>
            </div>
            <div className="stat-sep" />
            <div className="stat-item highlight">
              <span className="stat-num">{formatTotalTime(totalSeconds)}</span>
              <span className="stat-desc">total duration</span>
            </div>
          </div>
        </div>
      </footer>

      {exportedUrl && (
        <div className="modal-overlay" onClick={() => setExportedUrl('')}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">{exportedUrl === 'copied' ? 'Copied to clipboard!' : 'Export URIs'}</h2>
            <p className="modal-body">
              {exportedUrl === 'copied'
                ? 'Paste the track URIs into Spotify: open the desktop app, create a new playlist, click on it, then press Cmd+V (Mac) or Ctrl+V (Windows).'
                : 'Copy the URIs below and paste into Spotify desktop app:'}
            </p>
            {exportedUrl !== 'copied' && (
              <textarea className="export-uri-list" readOnly value={exportedUrl} rows={6} />
            )}
            <div className="modal-actions">
              <button className="modal-confirm import-confirm" onClick={() => setExportedUrl('')}>Done</button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Import Spotify Playlist</h2>
            <p className="modal-body">Paste a public Spotify playlist URL. This will create a new playlist in the sidebar.</p>
            <input
              className="import-url-input"
              value={importUrl}
              onChange={e => setImportUrl(e.target.value)}
              placeholder="https://open.spotify.com/playlist/..."
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleImport()}
            />
            {importError && <p className="import-error">{importError}</p>}
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setShowImportModal(false)}>Cancel</button>
              <button className="modal-confirm import-confirm" onClick={handleImport} disabled={importLoading}>
                {importLoading ? 'Importing…' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showResetConfirm && (
        <div className="modal-overlay" onClick={() => setShowResetConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Reset playlist?</h2>
            <p className="modal-body">This will clear all songs and reset the table to the default buckets. This cannot be undone.</p>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setShowResetConfirm(false)}>Cancel</button>
              <button className="modal-confirm" onClick={handleReset}>Yes, reset</button>
            </div>
          </div>
        </div>
      )}

      {deletePlaylistConfirm && (
        <div className="modal-overlay" onClick={() => setDeletePlaylistConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Delete playlist?</h2>
            <p className="modal-body">"{deletePlaylistConfirm.name}" will be permanently deleted. This cannot be undone.</p>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setDeletePlaylistConfirm(null)}>Cancel</button>
              <button className="modal-confirm" onClick={confirmDeletePlaylist}>Yes, delete</button>
            </div>
          </div>
        </div>
      )}

      {showBucketModal && (
        <div className="modal-overlay" onClick={() => setShowBucketModal(false)}>
          <div className="modal bucket-modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Manage Buckets</h2>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleBucketDragEnd} modifiers={[restrictToVerticalAxis]}>
              <SortableContext items={bucketDraft.map(b => b.name)} strategy={verticalListSortingStrategy}>
                <ul className="bucket-edit-list">
                  {bucketDraft.map((b, i) => (
                    <SortableBucketItem
                      key={b.name + i}
                      bucket={b}
                      idx={i}
                      onRename={handleRenameBucket}
                      onColorChange={handleBucketColor}
                      onRemove={handleRemoveBucket}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
            <div className="bucket-add-row">
              <input
                className="bucket-edit-input"
                placeholder="New bucket name…"
                value={newBucketName}
                onChange={e => setNewBucketName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddBucket()}
              />
              <button className="bucket-add-confirm-btn" onClick={handleAddBucket}>Add</button>
            </div>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setShowBucketModal(false)}>Cancel</button>
              <button className="modal-confirm" onClick={handleSaveBuckets}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
