// Search MusicBrainz for tracks, returns results compatible with the same shape as Spotify results
export async function searchMusicBrainz(query, signal) {
  if (!query || query.length < 2) return [];

  const q = `recording:"${query}" OR artist:"${query}"`;
  const params = new URLSearchParams({ query: q, fmt: 'json', limit: 10 });

  try {
    const res = await fetch(`https://musicbrainz.org/ws/2/recording?${params}`, {
      headers: { 'User-Agent': 'YogaMusicPlanner/1.0 (local-dev)' },
      signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.recordings || [])
      .filter(r => r.length)
      .map(r => ({
        id: r.id,
        name: r.title,
        artists: (r['artist-credit'] || []).map(a => a.artist?.name).filter(Boolean).join(', '),
        duration_ms: r.length,
        albumArt: null,
        source: 'musicbrainz',
      }));
  } catch (e) {
    if (e.name === 'AbortError') return null; // cancelled — caller ignores null
    return [];
  }
}
