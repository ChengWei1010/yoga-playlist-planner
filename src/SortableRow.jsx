import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SongSearch } from './SongSearch';
import { msToMinSec } from './spotify';
import { BUCKET_COLORS } from './data';
import { useRef, useState } from 'react';

const BUCKET_OPTIONS = [
  'Intro', 'Integration', 'Sun A', 'Sun B', 'Cardio', 'Core',
  'Squat', 'Balance', 'Hip', 'Cool down', 'Surrender', 'Savasana', 'Ending',
];

export function SortableRow({ row, index, token, isContinuation, parentBucket, bucketTotalTime, bucketOptions, isDraggingList, onUpdate, onDelete, onAddBelow, onAddSongToBucket, onRateLimit, viewMode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id });

  const activeBucket = isContinuation ? parentBucket : row.bucket;
  const bucketDef = (bucketOptions || []).find(b => b.name === activeBucket);
  const bucketColorDef = bucketDef?.color ? BUCKET_COLORS[bucketDef.color] : null;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    background: isDragging ? '#e8edf0' : (row.status === 'confirmed' ? '#ffffff' : '#f0f2f4'),
  };

  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  function handleTrackSelect(track) {
    onUpdate(row.id, 'song', track.name);
    onUpdate(row.id, 'songMin', msToMinSec(track.duration_ms));
    onUpdate(row.id, 'spotifyUri', track.uri);
    onUpdate(row.id, 'trackArtists', track.artists);
    onUpdate(row.id, 'previewUrl', track.previewUrl || null);
  }

  function handlePreview() {
    if (!row.previewUrl) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(row.previewUrl);
      audioRef.current.volume = 0.6;
      audioRef.current.addEventListener('ended', () => setPlaying(false));
    }
    if (playing) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setPlaying(false);
    } else {
      document.querySelectorAll('audio').forEach(a => a.pause());
      audioRef.current.play();
      setPlaying(true);
    }
  }

  const spotifyLink = row.spotifyUri && (
    <a
      className="preview-btn"
      href={`https://open.spotify.com/track/${row.spotifyUri.split(':')[2]}`}
      target="_blank"
      rel="noreferrer"
      title="Open in Spotify"
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
      </svg>
    </a>
  );

  return (
    <tr ref={setNodeRef} style={style} className={`table-row${isContinuation ? ' row-continuation' : ''}`}>

      {/* Drag handle — edit mode only */}
      {!viewMode && (
        <td className="drag-cell">
          <button
            className="drag-handle"
            {...attributes}
            {...listeners}
            title="Drag to reorder"
            tabIndex={-1}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="5" cy="4" r="1.2" fill="#A2B2BF" />
              <circle cx="5" cy="8" r="1.2" fill="#A2B2BF" />
              <circle cx="5" cy="12" r="1.2" fill="#A2B2BF" />
              <circle cx="10" cy="4" r="1.2" fill="#A2B2BF" />
              <circle cx="10" cy="8" r="1.2" fill="#A2B2BF" />
              <circle cx="10" cy="12" r="1.2" fill="#A2B2BF" />
            </svg>
          </button>
        </td>
      )}

      {/* Bucket */}
      {isContinuation ? (
        <td className="bucket-cell continuation-cell" style={bucketColorDef ? { background: bucketColorDef.bg } : {}}>
          <span className="continuation-indent">↳</span>
        </td>
      ) : (
        <td className="bucket-cell" style={bucketColorDef ? { background: bucketColorDef.bg } : {}}>
          {viewMode ? (
            <span className="view-cell-text" style={bucketColorDef ? { color: bucketColorDef.text, fontWeight: 600 } : {}}>{row.bucket || '—'}</span>
          ) : (
            <select
              className="cell-input bucket-select"
              value={row.bucket}
              onChange={e => onUpdate(row.id, 'bucket', e.target.value)}
              style={bucketColorDef ? { color: bucketColorDef.text, fontWeight: 600 } : {}}
            >
              <option value="">— select —</option>
              {(bucketOptions || BUCKET_OPTIONS).map(opt => (
                <option key={opt.name ?? opt} value={opt.name ?? opt}>{opt.name ?? opt}</option>
              ))}
            </select>
          )}
        </td>
      )}

      {/* Time */}
      <td className="col-time">
        {isContinuation ? null : (
          <span className="bucket-time-display">{bucketTotalTime || '—'}</span>
        )}
      </td>

      {/* Song */}
      <td className="song-cell">
        <div className="song-cell-inner">
          {spotifyLink}
          {viewMode ? (
            <div>
              <span className="view-cell-text">{row.song || '—'}</span>
              {row.trackArtists && <span className="row-artists">{row.trackArtists}</span>}
            </div>
          ) : (
            <div className="song-search-wrap">
              <SongSearch
                value={row.song}
                token={token}
                closeDropdown={isDraggingList}
                onSelect={handleTrackSelect}
                onChangeDirect={v => {
                  onUpdate(row.id, 'song', v);
                  if (!v) {
                    onUpdate(row.id, 'songMin', '');
                    onUpdate(row.id, 'trackArtists', '');
                    onUpdate(row.id, 'spotifyUri', '');
                    onUpdate(row.id, 'previewUrl', null);
                  }
                }}
                onRateLimit={onRateLimit}
              />
              {row.trackArtists && (
                <span className="row-artists">{row.trackArtists}</span>
              )}
            </div>
          )}
        </div>
      </td>

      {/* Song length */}
      <td className="col-songmin">
        {viewMode ? (
          <span className="view-cell-text">{row.songMin || '—'}</span>
        ) : (
          <input
            className="cell-input time-input"
            value={row.songMin}
            onChange={e => onUpdate(row.id, 'songMin', e.target.value)}
            placeholder="0:00"
          />
        )}
      </td>

      {/* Posture */}
      <td>
        {viewMode ? (
          <span className="view-cell-text view-posture">{row.posture || '—'}</span>
        ) : (
          <textarea
            className="cell-input posture-input"
            value={row.posture}
            onChange={e => {
              onUpdate(row.id, 'posture', e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 56) + 'px';
            }}
            onFocus={e => {
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 56) + 'px';
            }}
            placeholder="—"
            rows={1}
          />
        )}
      </td>

      {/* Status — edit mode only */}
      {!viewMode && (
        <td className="status-cell">
          <button
            className={`status-btn ${row.status === 'confirmed' ? 'status-confirmed' : 'status-draft'}`}
            onClick={() => onUpdate(row.id, 'status', row.status === 'confirmed' ? 'draft' : 'confirmed')}
            title="Click to toggle draft / confirmed"
          >
            {row.status === 'confirmed' ? '✓ Ready' : 'Draft'}
          </button>
        </td>
      )}

      {/* Actions — edit mode only */}
      {!viewMode && (
        <td className="action-cell">
          {!isContinuation && (
            <button
              className="group-btn"
              onClick={() => onAddSongToBucket(row.id)}
              title="Add another song to this bucket"
            >+ Song</button>
          )}
          <button
            className={`subrow-toggle-btn${isContinuation ? ' is-sub' : ''}`}
            onClick={() => {
              if (isContinuation) {
                onUpdate(row.id, 'isBucketHeader', true);
              } else {
                onUpdate(row.id, 'bucket', '');
                onUpdate(row.id, 'isBucketHeader', false);
              }
            }}
            title={isContinuation ? 'Make this its own bucket row' : 'Make this a sub-song'}
          >{isContinuation ? '↑ Own' : '↳ Sub'}</button>
          <button className="del-btn" onClick={() => onDelete(row.id)} title="Delete row">×</button>
        </td>
      )}
    </tr>
  );
}
