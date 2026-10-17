// The small APIs the extension uses, with their keys kept here (Worker secrets), not in the extension.
// Same behaviour as server/server.js. Caches are per Worker instance (best effort, like the old server's).

export function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  });
}

// ---- GIF search via KLIPY ----
export async function gifs(url, env) {
  const key = env.KLIPY_API_KEY;
  if (!key) return json(503, { error: 'no-key' });
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
  const params = new URLSearchParams({
    page: String(Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1)),
    per_page: '24',
    customer_id: (url.searchParams.get('cid') || 'anonymous').slice(0, 64),
    content_filter: 'medium',
  });
  if (q) params.set('q', q);
  try {
    const r = await fetch(`https://api.klipy.com/api/v1/${encodeURIComponent(key)}/gifs/${q ? 'search' : 'trending'}?${params}`);
    const body = await r.json();
    if (!r.ok || !body.result) return json(502, { error: 'klipy' });
    const pick = (file, size) => {
      const f = file?.[size]?.webp || file?.[size]?.gif;
      return f && { url: f.url, width: f.width, height: f.height };
    };
    const items = (body.data?.data || [])
      .filter((g) => g.type !== 'ad' && g.file)
      .map((g) => ({ id: g.id, title: g.title || '', preview: pick(g.file, 'sm') || pick(g.file, 'xs'), full: pick(g.file, 'md') || pick(g.file, 'sm') }))
      .filter((g) => g.preview && g.full);
    return json(200, { gifs: items, hasNext: Boolean(body.data?.has_next) });
  } catch (e) {
    console.error('klipy request failed', e?.message);
    return json(502, { error: 'klipy' });
  }
}

// ---- Tonight's deck: what streams in your country (TMDB, with JustWatch's where-to-watch data) ----
const PROVIDERS = {
  Netflix: '8', 'Prime Video': '9|119', 'Disney+': '337', Max: '1899|384', Hulu: '15',
  'Apple TV+': '350', 'Paramount+': '531', Peacock: '386|387', Crunchyroll: '283',
};
// Genre ids differ between shows and films (null: TMDB has no such genre for that kind).
const TMDB_GENRES = {
  Crime: [80, 80], Drama: [18, 18], Comedy: [35, 35], Thriller: [9648, 53], Mystery: [9648, 9648],
  Romance: [10749, 10749], 'Science-Fiction': [10765, 878], Fantasy: [10765, 14], Action: [10759, 28],
  Horror: [null, 27], Anime: [16, 16], Family: [10751, 10751],
};
// "Genres" that are really where it's from (drama only for the -dramas' shows; their films are any genre).
const ORIGINS = {
  Filipino: { country: 'PH' }, 'K-drama': { country: 'KR', tv: 18 }, Thai: { country: 'TH' },
  'C-drama': { country: 'CN|TW', tv: 18 }, 'J-drama': { country: 'JP', tv: 18 }, Bollywood: { country: 'IN', lang: 'hi' },
};
const tmdbCache = new Map(); // url -> { at, body }
const deckHits = new Map(); // ip -> { at, n }
async function tmdb(env, path, params = {}) {
  const key = String(env.TMDB_KEY || '').trim();
  const bearer = key.startsWith('eyJ');
  const q = new URLSearchParams(bearer ? params : { ...params, api_key: key });
  const cacheKey = `${path}?${new URLSearchParams(params)}`;
  const hit = tmdbCache.get(cacheKey);
  if (hit && Date.now() - hit.at < 6 * 3600 * 1000) return hit.body;
  const r = await fetch(`https://api.themoviedb.org/3${path}?${q}`, bearer ? { headers: { authorization: `Bearer ${key}` } } : {});
  if (!r.ok) throw new Error(`tmdb ${r.status}`);
  const body = await r.json();
  if (tmdbCache.size > 2000) tmdbCache.delete(tmdbCache.keys().next().value);
  tmdbCache.set(cacheKey, { at: Date.now(), body });
  return body;
}
export async function deck(url, request, env) {
  if (!String(env.TMDB_KEY || '').trim()) return json(503, { error: 'no-key' });
  // A deck is a handful of TMDB calls; 30 decks a minute from one address is plenty.
  const ip = request.headers.get('cf-connecting-ip') || '';
  const now = Date.now();
  const h = deckHits.get(ip);
  if (h && now - h.at < 60000 && h.n >= 30) return json(429, { error: 'slow-down' });
  deckHits.set(ip, h && now - h.at < 60000 ? { at: h.at, n: h.n + 1 } : { at: now, n: 1 });
  if (deckHits.size > 5000) deckHits.clear();

  const p = url.searchParams;
  const country = /^[A-Z]{2}$/.test(p.get('country') || '') ? p.get('country') : 'US';
  const platform = PROVIDERS[p.get('platform')] ? p.get('platform') : '';
  const genre = TMDB_GENRES[p.get('genre')] ? p.get('genre') : '';
  const origin = ORIGINS[p.get('genre')] || null;
  const want = p.get('kind');
  const kinds = (want === 'tv' || want === 'movie' ? [want] : ['tv', 'movie']).filter((k) => !genre || TMDB_GENRES[genre][k === 'tv' ? 0 : 1]);
  try {
    const lists = await Promise.all(
      kinds.map(async (kind) => {
        const params = {
          watch_region: country, with_watch_monetization_types: 'flatrate', sort_by: 'popularity.desc',
          'vote_average.gte': '7', 'vote_count.gte': kind === 'tv' ? '150' : '400', include_adult: 'false',
        };
        if (origin) {
          // Smaller catalogues get fewer votes on TMDB: a lower bar, still well liked.
          Object.assign(params, { with_origin_country: origin.country, 'vote_average.gte': '6.5', 'vote_count.gte': '15' });
          if (kind === 'tv' && origin.tv) params.with_genres = String(origin.tv);
          if (origin.lang) params.with_original_language = origin.lang;
          params.without_genres = origin.tv ? '16' : '10767,10763'; // a drama, not an anime / no talk shows or news
        }
        if (platform) params.with_watch_providers = PROVIDERS[platform];
        if (genre) params.with_genres = String(TMDB_GENRES[genre][kind === 'tv' ? 0 : 1]);
        if (genre === 'Anime') params.with_original_language = 'ja';
        const first = await tmdb(env, `/discover/${kind}`, { ...params, page: '1' });
        const page = 1 + Math.floor(Math.random() * Math.min(5, first.total_pages || 1));
        const body = page === 1 ? first : await tmdb(env, `/discover/${kind}`, { ...params, page: String(page) });
        return (body.results || []).filter((x) => x.poster_path).map((x) => ({ kind, x }));
      }),
    );
    const picks = lists.flat();
    for (let i = picks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [picks[i], picks[j]] = [picks[j], picks[i]];
    }
    const cards = await Promise.all(
      picks.slice(0, 16).map(async ({ kind, x }) => {
        // Where it streams in that country (the asked-for platform when there is one).
        let where = platform;
        if (!where) {
          try {
            where = (await tmdb(env, `/${kind}/${x.id}/watch/providers`)).results?.[country]?.flatrate?.[0]?.provider_name || '';
          } catch {}
        }
        const year = String(x.first_air_date || x.release_date || '').slice(0, 4);
        return {
          id: `tmdb:${kind}:${x.id}`, kind: kind === 'tv' ? 'show' : 'movie', title: x.name || x.title || '',
          sub: [year, kind === 'movie' ? 'Movie' : '', where].filter(Boolean).join(' · '),
          summary: String(x.overview || '').slice(0, 260),
          image: `https://image.tmdb.org/t/p/w342${x.poster_path}`, where,
        };
      }),
    );
    return json(200, { country, cards });
  } catch (e) {
    console.error('tmdb request failed', e?.message);
    return json(502, { error: 'tmdb' });
  }
}

// ---- Call relay (TURN) ----
// Logins last a day; one set is shared for an hour.
const STUN = { urls: 'stun:stun.l.google.com:19302' };
let iceCache = null; // { at, servers }
export async function ice(env) {
  if (iceCache && Date.now() - iceCache.at < 3600 * 1000) return json(200, { iceServers: iceCache.servers });
  const keyId = String(env.CF_TURN_KEY_ID || '').trim();
  const token = String(env.CF_TURN_API_TOKEN || '').trim();
  const turnUrls = String(env.TURN_URLS || '').split(',').map((u) => u.trim()).filter(Boolean);
  let servers = [STUN];
  try {
    if (keyId && token) {
      const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ttl: 86400 }),
      });
      if (!r.ok) throw new Error(`cloudflare turn ${r.status}`);
      const body = await r.json();
      const list = Array.isArray(body.iceServers) ? body.iceServers : [body.iceServers].filter(Boolean);
      if (list.length) servers = [STUN, ...list];
    } else if (turnUrls.length) {
      servers = [STUN, { urls: turnUrls, username: env.TURN_USERNAME || '', credential: env.TURN_CREDENTIAL || '' }];
    }
  } catch (e) {
    console.error('turn credentials failed', e?.message);
    return json(200, { iceServers: servers }); // calls still try directly; not cached, so the next one retries
  }
  iceCache = { at: Date.now(), servers };
  return json(200, { iceServers: servers });
}
