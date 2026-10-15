// "Best episodes": what Reddit says about the show you're watching. We search Reddit for threads like
// "best episodes of <show>", read their top comments, and count which episodes people name
// (S4E4, 2x05, "season 3 episode 7", "episode 5"), weighting upvoted comments more.
// Requests go from your own browser, like visiting Reddit; nothing passes through our server.
(function () {
  const HOSTS = ['https://www.reddit.com', 'https://old.reddit.com'];
  const THREADS = 4; // how many threads we read comments from
  const cache = new Map(); // query -> { at, result }

  const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
  const NUM = `(\\d{1,3}|${Object.keys(WORDS).join('|')})`;
  const toNum = (x) => Number(WORDS[String(x).toLowerCase()] ?? x);

  // Episode keys named in a piece of text: 'S4E4', or 'E5' when no season is given.
  function episodesIn(text) {
    const found = new Map(); // key -> index in the text (for a snippet)
    const add = (s, e, at) => {
      if (!(e >= 1 && e <= 200) || (s != null && !(s >= 1 && s <= 50))) return;
      const key = s != null ? `S${s}E${e}` : `E${e}`;
      if (!found.has(key)) found.set(key, at);
    };
    let rest = String(text || '');
    const take = (re, fn) => {
      rest = rest.replace(re, (m, ...g) => {
        fn(g, g[g.length - 2]);
        return ' '.repeat(m.length); // so the looser patterns below don't count it again
      });
    };
    take(new RegExp(`\\b(?:episode|ep)\\.?\\s*#?0*${NUM}\\s+(?:of|in|from)\\s+(?:the\\s+)?season\\s+${NUM}\\b`, 'gi'), (g, at) => add(toNum(g[1]), toNum(g[0]), at));
    take(new RegExp(`\\bs(?:eason)?\\s*0*${NUM}\\s*[,:.\\-]?\\s*e(?:p(?:isode)?)?\\.?\\s*#?0*${NUM}\\b`, 'gi'), (g, at) => add(toNum(g[0]), toNum(g[1]), at));
    take(/\b(\d{1,2})x(\d{2})\b/g, (g, at) => add(Number(g[0]), Number(g[1]), at));
    take(new RegExp(`\\b${NUM}(?:st|nd|rd|th)?\\s+season'?s?\\s+(?:ep(?:isode)?\\.?\\s*)?#?${NUM}\\b`, 'gi'), (g, at) => add(toNum(g[0]), toNum(g[1]), at));
    take(new RegExp(`\\b(?:episode|ep)\\.?\\s*#?0*${NUM}\\b`, 'gi'), (g, at) => add(null, toNum(g[0]), at));
    return found;
  }

  function label(key) {
    const m = key.match(/^S(\d+)E(\d+)$/);
    return m ? `S${m[1]} E${m[2]}` : `Episode ${key.slice(1)}`;
  }

  // Plain text around where an episode is named, without Reddit's markdown.
  function snippet(body, at) {
    const text = String(body || '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^>.*$/gm, ' ')
      .replace(/[*_~`#>]+/g, '')
      .replace(/\s+/g, ' ');
    const start = Math.max(0, at - 60);
    let s = text.slice(start, start + 160).trim();
    if (start > 0) s = `…${s.replace(/^\S*\s/, '')}`;
    if (start + 160 < text.length) s = `${s.replace(/\s\S*$/, '')}…`;
    return s;
  }

  async function getJson(path) {
    let lastError = null;
    for (const host of HOSTS) {
      try {
        // With your Reddit sign-in (if any), since Reddit turns away anonymous requests more and more.
        const r = await fetch(host + path, { headers: { Accept: 'application/json' }, credentials: 'include' });
        if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw new Error(`reddit ${r.status}`);
        return await r.json();
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError;
  }

  const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

  // Count episode mentions across comments. Each comment counts once per episode; upvotes add weight.
  function rank(comments) {
    const tally = new Map(); // key -> { key, mentions, weight, best }
    for (const c of comments) {
      for (const [key, at] of episodesIn(c.body)) {
        const t = tally.get(key) || { key, mentions: 0, weight: 0, best: null };
        t.mentions += 1;
        t.weight += 1 + Math.log2(1 + Math.max(0, c.score || 0));
        if (!t.best || (c.score || 0) > t.best.score) t.best = { score: c.score || 0, text: snippet(c.body, at), url: c.url };
        tally.set(key, t);
      }
    }
    return [...tally.values()]
      .filter((t) => t.mentions >= 2 || t.weight >= 4) // a single offhand mention isn't a pick
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10)
      .map((t) => ({ key: t.key, label: label(t.key), mentions: t.mentions, quote: t.best.text, url: t.best.url }));
  }

  async function bestEpisodes(show) {
    const name = String(show || '').trim().slice(0, 100);
    if (!name) throw new Error('no show');
    const hit = cache.get(norm(name));
    if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.result;

    const q = encodeURIComponent(`${name} best episodes`);
    const search = await getJson(`/search.json?q=${q}&sort=relevance&t=all&type=link&limit=25&raw_json=1`);
    const want = norm(name);
    const threads = (search?.data?.children || [])
      .map((c) => c.data)
      .filter((d) => d && !d.over_18 && d.num_comments >= 5)
      .map((d) => ({
        title: d.title,
        sub: d.subreddit_name_prefixed,
        comments: d.num_comments,
        url: `https://www.reddit.com${d.permalink}`,
        permalink: d.permalink,
        selftext: d.selftext || '',
        // Threads that name the show (and ask about episodes) first, then the busiest.
        fit: (norm(d.title).includes(want) || norm(d.subreddit).includes(want.replace(/ /g, '')) ? 2 : 0) + (/episode/i.test(d.title) ? 1 : 0),
      }))
      .sort((a, b) => b.fit - a.fit || b.comments - a.comments)
      .slice(0, THREADS);

    const comments = [];
    await Promise.all(threads.map(async (t) => {
      comments.push({ body: `${t.title}\n${t.selftext}`, score: 0, url: t.url });
      try {
        const [, list] = await getJson(`${t.permalink.replace(/\/$/, '')}.json?sort=top&limit=150&depth=2&raw_json=1`);
        const walk = (children) => {
          for (const c of children || []) {
            if (c.kind !== 't1' || !c.data?.body) continue;
            comments.push({ body: c.data.body, score: c.data.score, url: `https://www.reddit.com${c.data.permalink}` });
            if (c.data.replies?.data) walk(c.data.replies.data.children);
          }
        };
        walk(list?.data?.children);
      } catch {}
    }));

    const result = {
      show: name,
      episodes: rank(comments),
      threads: threads.map(({ title, sub, comments: n, url }) => ({ title, sub, comments: n, url })),
      searchUrl: `https://www.reddit.com/search/?q=${q}`,
    };
    cache.set(norm(name), { at: Date.now(), result });
    return result;
  }

  const api = { bestEpisodes, episodesIn, rank, label, snippet, searchUrl: (show) => `https://www.reddit.com/search/?q=${encodeURIComponent(`${show} best episodes`)}` };
  if (typeof module !== 'undefined') module.exports = api;
  else self.Reddit = api;
})();
