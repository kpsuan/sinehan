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

  // ---- The episode guide ----
  // Gives each episode its real title, and lets us recognize episodes people describe instead of
  // numbering ("the one where the hospitals merged and they investigate who let her die").
  // TVmaze (free, no key) lists the episodes; Wikipedia's season pages add fuller plot summaries.
  const guides = new Map(); // normalized show name -> guide or null
  async function episodeGuide(show) {
    const key = norm(show);
    if (guides.has(key)) return guides.get(key);
    const store = typeof chrome !== 'undefined' && chrome.storage?.local;
    const stored = store ? (await store.get('episodeGuides').catch(() => ({}))).episodeGuides || {} : {};
    let raw = stored[key]?.at > Date.now() - 7 * 24 * 3600 * 1000 ? stored[key] : null;
    if (!raw) {
      try {
        const r = await fetch(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(show)}&embed=episodes`, { credentials: 'omit' });
        if (r.ok) {
          const data = await r.json();
          const wiki = await wikiSummaries(data);
          // Only what we use: titles and summaries.
          raw = {
            at: Date.now(),
            name: data.name,
            episodes: (data._embedded?.episodes || []).map((e) => ({ season: e.season, number: e.number, name: e.name, summary: e.summary || '' })),
            wiki: [...wiki],
          };
          if (store) {
            const keep = Object.fromEntries(Object.entries({ ...stored, [key]: raw }).sort((a, b) => b[1].at - a[1].at).slice(0, 5));
            store.set({ episodeGuides: keep }).catch(() => {});
          }
        }
      } catch {}
    }
    const guide = raw ? makeGuide({ name: raw.name, _embedded: { episodes: raw.episodes } }, new Map(raw.wiki)) : null;
    guides.set(key, guide);
    return guide;
  }

  // Wikipedia's episode tables: "S2E16" -> plot summary. All the season pages come in one request.
  async function wikiSummaries(data) {
    const out = new Map();
    const name = String(data?.name || '');
    const seasons = [...new Set((data?._embedded?.episodes || []).map((e) => e.season).filter(Boolean))].slice(0, 45);
    if (!name || !seasons.length) return out;
    const titles = [`List of ${name} episodes`, ...(seasons.length > 1 ? seasons.map((n) => `${name} season ${n}`) : [])];
    try {
      const url = 'https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&formatversion=2&redirects=1&origin=*'
        + `&titles=${encodeURIComponent(titles.join('|'))}`;
      const r = await fetch(url, { credentials: 'omit' });
      if (!r.ok) return out;
      for (const pg of (await r.json())?.query?.pages || []) {
        const text = pg.revisions?.[0]?.slots?.main?.content || '';
        const season = Number(String(pg.title).match(/season (\d+)$/i)?.[1]) || null;
        parseEpisodeTables(text, season, out);
      }
    } catch {}
    return out;
  }
  function parseEpisodeTables(wikitext, season, out) {
    for (const block of wikitext.split(/\{\{(?:#invoke:)?Episode list/i).slice(1)) {
      const field = (f) => block.match(new RegExp(`\\|\\s*${f}\\s*=([\\s\\S]*?)(?=\\n\\s*\\|\\s*[A-Za-z0-9_]+\\s*=|\\n\\}\\})`))?.[1] || '';
      const n = Number(field('EpisodeNumber2').trim()) || (season == null ? 0 : Number(field('EpisodeNumber').trim()));
      const s = season ?? Number(block.match(/season\s+(\d+)/i)?.[1]);
      const summary = field('ShortSummary')
        .replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, ' ')
        .replace(/\{\{[^{}]*\}\}/g, ' ')
        .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
        .replace(/'''?|<[^>]+>/g, ' ');
      if (s && n && summary.trim() && !out.has(`S${s}E${n}`)) out.set(`S${s}E${n}`, summary);
    }
  }

  const STOP = new Set(('the and that this with from they them their there then than when what where which while were have has had ' +
    'just like really very much more most some also only even still into about after before over again because would could should ' +
    'episode episodes season seasons show series favorite favourite best watch watched watching scene scenes thing things time ' +
    'think thought good great love loved know your you are was but not for its it\'s one ones she her him his who how why all out ' +
    'get got make made being been does did done can will well back first last next other another every each many such ' +
    'under over around through whole part moment lady guy girl woman women people person everyone someone something character ' +
    'characters actually literally always never ever still though tension stress stressed cried crying sad happy funny amazing favorit favourit episod').split(/\s+/));
  // The same plot event, worded the way a viewer would vs. the way a summary would.
  const SAME = [
    [/^(death|dead|dies|died|dying|kill|killed|kills|killing)$/, 'die'],
    [/^(investigat\w*|interrogat\w*|interview\w*|inquiry|whodunn?it|dunnit)$/, 'investig'],
    [/^(bomb\w*|explosive\w*|explosion\w*|explode\w*|ordnance)$/, 'bomb'],
    [/^(shooting|shooter|shot|gunman|gunshots?|gunfire)$/, 'shoot'],
    [/^(wedding|married|marry|marries)$/, 'wed'],
    [/^(merge|merged|merger|merging)$/, 'merg'],
    [/^(crash|crashed|crashes)$/, 'crash'],
  ];
  // Rough word stems, so "merged"/"merger" and "died"/"dies" meet.
  function stems(text) {
    const out = new Set();
    for (let w of String(text || '').toLowerCase().replace(/<[^>]+>/g, ' ').match(/[a-z]+/g) || []) {
      const same = SAME.find(([re]) => re.test(w));
      if (same) {
        out.add(same[1]);
        continue;
      }
      if (w.length < 4 || STOP.has(w)) continue;
      w = w.replace(/ie[ds]$/, 'ie');
      for (const end of ['ings', 'ing', 'ers', 'er', 'ed', 'es', 's']) {
        if (w.endsWith(end) && w.length - end.length >= 4) {
          w = w.slice(0, -end.length);
          break;
        }
      }
      w = w.slice(0, 7);
      if (!STOP.has(w)) out.add(w);
    }
    return out;
  }

  function makeGuide(data, wiki = new Map()) {
    const eps = (data?._embedded?.episodes || [])
      .filter((e) => e.season && e.number)
      .map((e) => ({ key: `S${e.season}E${e.number}`, season: e.season, number: e.number, name: String(e.name || '').trim(),
        words: stems(`${e.name} ${e.summary || ''} ${wiki.get(`S${e.season}E${e.number}`) || ''}`) }));
    if (!eps.length) return null;
    // How rare each word is across the show: "bomb" says a lot, the main characters' names don't.
    const df = new Map();
    for (const e of eps) for (const w of e.words) df.set(w, (df.get(w) || 0) + 1);
    const showWords = stems(data.name);
    const idf = (w) => (!df.has(w) || showWords.has(w) || df.get(w) > eps.length * 0.12 ? 0 : Math.log(eps.length / df.get(w)));
    const byKey = new Map(eps.map((e) => [e.key, e]));
    // Titles worth looking for in comments: several words, or one long distinctive word, and not a
    // phrase the show's summaries use all the time ("Red John" is The Mentalist's villain, not just S6E8).
    const texts = (data?._embedded?.episodes || []).map((e) => ` ${norm(`${e.summary || ''} ${wiki.get(`S${e.season}E${e.number}`) || ''}`)} `);
    const titled = eps.filter((e) => {
      const long = e.name.split(/\s+/).length >= 2 ? e.name.length >= 8 : e.name.length >= 9 && !/^(pilot|chapter|episode|part)/i.test(e.name);
      if (!long) return false;
      const phrase = ` ${norm(e.name)} `;
      return texts.filter((t) => t.includes(phrase)).length <= 2;
    });
    return { eps, byKey, idf, titled, seasons: new Set(eps.map((e) => e.season)).size };
  }

  // An episode named by its title in the comment ("Dear Billy was incredible").
  function titleIn(text, guide) {
    const t = ` ${norm(text)} `;
    for (const e of guide.titled) if (t.includes(` ${norm(e.name)} `)) return e.key;
    return null;
  }

  // An episode described rather than named: the one whose summary shares the most rare words with the
  // comment, if it's a clear winner.
  const DESCRIBES = /episode|\bep\b|favou?rite|\bbest\b|the one (where|with|when)|when (they|she|he)/i;
  function describedIn(text, guide) {
    if (!DESCRIBES.test(text) || text.length < 30) return null;
    const words = stems(text);
    const scored = [];
    for (const e of guide.eps) {
      let score = 0;
      let shared = 0;
      for (const w of words) {
        if (!e.words.has(w)) continue;
        const v = guide.idf(w);
        if (v > 0) {
          score += v;
          shared += 1;
        }
      }
      if (shared) scored.push({ e, score, shared });
    }
    if (!scored.length) return null;
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    // Two-parters and story arcs share details: the episodes right next to the best one aren't rivals.
    const near = (x) => x.e.season === best.e.season && Math.abs(x.e.number - best.e.number) <= 1;
    const second = scored.slice(1).find((x) => !near(x))?.score || 0;
    best.key = best.e.key;
    const clear = best.shared >= 2 ? best.score >= 7 && best.score >= second * 1.5 : best.score >= 5 && best.score >= second * 2;
    return clear ? best.key : null;
  }

  // Count episode mentions across comments. Each comment counts once per episode; its upvotes add
  // weight, and so do its thread's (a pick in a 5k-upvote thread counts more than one in a quiet thread).
  // With the episode guide, comments that describe or name an episode by title count too.
  // Which episode a thread is about, from its title ("Blinking Red Light is the best episode imo").
  function threadEpisode(title, guide) {
    const [first] = episodesIn(title).keys();
    if (first) return /^S\d+E\d+$/.test(first) ? first : guide?.seasons === 1 ? `S1${first}` : null;
    return guide ? titleIn(title, guide) : null;
  }

  function rank(comments, guide = null) {
    const tally = new Map(); // key -> { key, mentions, described, upvotes, weight, best }
    const about = new Map(); // thread url -> the episode it's about
    for (const c of comments) if (c.isPost && !about.has(c.url)) about.set(c.url, threadEpisode(c.threadTitle || '', guide));
    for (const c of comments) {
      const threadBoost = 1 + Math.log10(1 + Math.max(0, c.threadScore || 0)) / 3;
      let found = [...episodesIn(c.body)].map(([key, at]) => ({ key, at, described: false }));
      if (guide) {
        // One-season shows: "episode 5" is S1E5.
        if (guide.seasons === 1) found = found.map((f) => (/^E\d+$/.test(f.key) ? { ...f, key: `S1${f.key}` } : f));
        const named = !found.length && titleIn(c.body, guide);
        if (named) found = [{ key: named, at: 0, described: false }];
      }
      // In a thread about one episode, comments that don't name another are about that one
      // ("This episode was also the one Simon Baker directed!"); the thread's own upvotes back it too.
      const topic = about.get(c.threadUrl || c.url);
      if (!found.length && topic && (c.isPost || c.topLevel)) found = [{ key: topic, at: 0, described: false, fromThread: true }];
      // Otherwise, maybe it describes one ("the one where the hospitals merged…").
      if (!found.length && guide) {
        const key = describedIn(c.body, guide);
        if (key) found = [{ key, at: 0, described: true }];
      }
      // Still nothing: a reply often says which episode it was ("that's S2E16!").
      if (!found.length && DESCRIBES.test(c.body)) {
        for (const r of c.replies || []) {
          const [first] = episodesIn(r).keys();
          const key = first || (guide && titleIn(r, guide));
          if (key && /^S\d+E\d+$/.test(key)) {
            found = [{ key, at: 0, described: true }];
            break;
          }
        }
      }
      for (const { key, at, described, fromThread } of found) {
        const t = tally.get(key) || { key, mentions: 0, described: 0, upvotes: 0, weight: 0, best: null };
        t.mentions += 1;
        if (described) t.described += 1;
        t.upvotes += Math.max(0, c.score || 0);
        // Upvotes lead: a 400-upvote comment naming an episode outweighs a dozen unnoticed ones.
        // A guess from a description counts a bit less than a clear "S4E4".
        t.weight += (1 + Math.sqrt(Math.max(0, c.score || 0))) * threadBoost * (described ? 0.8 : 1);
        // Quote someone praising the episode by name when we can, rather than a passing "this episode".
        const better = !t.best || (t.best.fromThread && !fromThread) || ((c.score || 0) > t.best.score && !(fromThread && !t.best.fromThread));
        if (better) t.best = { score: c.score || 0, text: snippet(c.body, at), url: c.url, fromThread };
        tally.set(key, t);
      }
    }
    return [...tally.values()]
      .filter((t) => t.mentions >= 2 || t.weight >= 4) // a single offhand mention isn't a pick
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10)
      .map((t) => ({
        key: t.key,
        label: label(t.key),
        title: guide?.byKey.get(t.key)?.name || '',
        mentions: t.mentions,
        described: t.described,
        upvotes: t.upvotes,
        quote: t.best.text,
        quoteUpvotes: t.best.score,
        url: t.best.url,
      }));
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
      .filter((d) => d && !d.over_18 && d.num_comments >= 5 && d.score >= 3)
      .map((d) => ({
        title: d.title,
        sub: d.subreddit_name_prefixed,
        comments: d.num_comments,
        upvotes: d.score,
        url: `https://www.reddit.com${d.permalink}`,
        permalink: d.permalink,
        selftext: d.selftext || '',
        // Threads that name the show (and ask about episodes) first, then the busiest.
        fit: (norm(d.title).includes(want) || norm(d.subreddit).includes(want.replace(/ /g, '')) ? 2 : 0) + (/episode/i.test(d.title) ? 1 : 0),
      }))
      // Best fit first; among those, the most upvoted and busiest.
      .sort((a, b) => b.fit - a.fit || Math.log10(1 + b.upvotes) + Math.log10(1 + b.comments) - (Math.log10(1 + a.upvotes) + Math.log10(1 + a.comments)))
      .slice(0, THREADS);

    const comments = [];
    const guide = episodeGuide(name); // fetched alongside the threads
    await Promise.all(threads.map(async (t) => {
      // The post itself: its upvotes are votes for what its title says.
      comments.push({ body: `${t.title}\n${t.selftext}`, score: t.upvotes, threadScore: t.upvotes, url: t.url, threadUrl: t.url, threadTitle: t.title, isPost: true });
      try {
        const [, list] = await getJson(`${t.permalink.replace(/\/$/, '')}.json?sort=top&limit=150&depth=2&raw_json=1`);
        const walk = (children, depth = 0) => {
          for (const c of children || []) {
            if (c.kind !== 't1' || !c.data?.body) continue;
            const replies = (c.data.replies?.data?.children || []).filter((x) => x.kind === 't1' && x.data?.body).map((x) => x.data.body);
            comments.push({ body: c.data.body, replies, score: c.data.score, threadScore: t.upvotes, url: `https://www.reddit.com${c.data.permalink}`,
              threadUrl: t.url, topLevel: depth === 0 });
            if (c.data.replies?.data) walk(c.data.replies.data.children, depth + 1);
          }
        };
        walk(list?.data?.children);
      } catch {}
    }));

    const result = {
      show: name,
      episodes: rank(comments, await guide),
      threads: threads.map(({ title, sub, comments: n, upvotes, url }) => ({ title, sub, comments: n, upvotes, url })),
      searchUrl: `https://www.reddit.com/search/?q=${q}`,
    };
    cache.set(norm(name), { at: Date.now(), result });
    return result;
  }

  const api = { bestEpisodes, episodesIn, rank, label, snippet, makeGuide, wikiSummaries, describedIn, titleIn, stems, searchUrl: (show) => `https://www.reddit.com/search/?q=${encodeURIComponent(`${show} best episodes`)}` };
  if (typeof module !== 'undefined') module.exports = api;
  else self.Reddit = api;
})();
