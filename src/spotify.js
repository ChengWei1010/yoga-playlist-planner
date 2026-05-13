// Replace SPOTIFY_CLIENT_ID with your actual Client ID from developer.spotify.com
export const SPOTIFY_CLIENT_ID = 'c4dd68c06a6540ea8aa1b291d6772937';
export const REDIRECT_URI = import.meta.env.PROD
  ? 'https://chengwei1010.github.io/yoga-playlist-planner/callback'
  : 'http://127.0.0.1:5174/callback';
export const SCOPES = [
  'user-read-private',
  'user-read-email',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
].join(' ');

const VERIFIER_KEY = 'spotify_pkce_verifier';
const TOKEN_KEY = 'spotify_access_token';
const EXPIRY_KEY = 'spotify_token_expiry';

function generateRandom(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(array).map(b => chars[b % chars.length]).join('');
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest('SHA-256', data);
}

function base64urlEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function startLogin() {
  const verifier = generateRandom(64);
  const hashed = await sha256(verifier);
  const challenge = base64urlEncode(hashed);
  sessionStorage.setItem(VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    show_dialog: 'true',
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

export async function handleCallback(code) {
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error('No PKCE verifier found');

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });

  if (!response.ok) throw new Error('Token exchange failed');
  const data = await response.json();
  const expiry = Date.now() + data.expires_in * 1000;
  localStorage.setItem(TOKEN_KEY, data.access_token);
  localStorage.setItem(EXPIRY_KEY, String(expiry));
  sessionStorage.removeItem(VERIFIER_KEY);
  return data.access_token;
}

export function getToken() {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiry = Number(localStorage.getItem(EXPIRY_KEY));
  if (!token || Date.now() > expiry) return null;
  return token;
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRY_KEY);
}

export async function searchTracks(query, token) {
  if (!query || query.length < 2) return [];
  const params = new URLSearchParams({ q: query, type: 'track', limit: 8 });
  const res = await fetch(`https://api.spotify.com/v1/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    if (res.status === 429) return null; // rate limited — caller keeps existing results
    return [];
  }
  const data = await res.json();
  return (data.tracks?.items || []).map(t => ({
    id: t.id,
    name: t.name,
    artists: t.artists.map(a => a.name).join(', '),
    duration_ms: t.duration_ms,
    albumArt: t.album.images[2]?.url || t.album.images[0]?.url,
    uri: t.uri,
    previewUrl: t.preview_url || null,
  }));
}

export async function getSpotifyUser(token) {
  const res = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchPlaylist(playlistId, token) {
  const res = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    console.error('fetchPlaylist failed:', res.status, await res.text());
    return null;
  }
  const data = await res.json();
  const items = data.items?.items || data.tracks?.items || [];
  const tracks = items
    .filter(i => i.track || i.item)
    .map(i => {
      const t = i.track || i.item;
      return {
        id: t.id,
        name: t.name,
        artists: t.artists.map(a => a.name).join(', '),
        duration_ms: t.duration_ms,
        albumArt: t.album?.images[2]?.url || t.album?.images[0]?.url,
        uri: t.uri,
        previewUrl: t.preview_url || null,
      };
    });
  return { name: data.name || 'Imported Playlist', tracks };
}

export async function exportPlaylist(name, uris, token, userId) {
  // Create playlist using /me endpoint instead of /users/:id
  const createRes = await fetch(`https://api.spotify.com/v1/me/playlists`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, public: false, description: 'Created with Yoga Music Planner' }),
  });
  console.log('create playlist status:', createRes.status, 'userId:', userId);
  if (!createRes.ok) {
    console.error('create failed:', await createRes.text());
    return null;
  }
  const playlist = await createRes.json();

  // Add tracks using PUT (replace) for first batch, POST for subsequent
  for (let i = 0; i < uris.length; i += 100) {
    const batch = uris.slice(i, i + 100);
    const method = i === 0 ? 'PUT' : 'POST';
    const addRes = await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: batch }),
    });
    console.log('add tracks status:', addRes.status, 'method:', method, 'playlist id:', playlist.id);
    if (!addRes.ok) {
      const err = await addRes.text();
      console.error('add tracks failed:', err);
    }
  }

  return playlist.external_urls.spotify;
}

export function msToMinSec(ms) {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}
