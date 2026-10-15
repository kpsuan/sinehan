// "Best episodes": what Reddit says about the show you're watching. We search Reddit for threads like
// "best episodes of <show>", read their top comments, and count which episodes people name
// (S4E4, 2x05, "season 3 episode 7", "episode 5"), weighting upvoted comments more.
// Requests go from your own browser, like visiting Reddit; nothing passes through our server.
(function () {
  const HOSTS = ['https://www.reddit.com', 'https://old.reddit.com'];
  const THREADS = 4; // how many threads we read comments from
  const cache = new Map(); // query -> { at, result }

  const WORDS = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
    fifth: 5,
    sixth: 6,
    seventh: 7,
    eighth: 8,
    ninth: 9,
    tenth: 10,
  };
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
    take(
      new RegExp(`\\b(?:episode|ep)\\.?\\s*#?0*${NUM}\\s+(?:of|in|from)\\s+(?:the\\s+)?season\\s+${NUM}\\b`, 'gi'),
      (g, at) => add(toNum(g[1]), toNum(g[0]), at),
    );
    take(
      new RegExp(`\\bs(?:eason)?\\s*0*${NUM}\\s*[,:.\\-]?\\s*e(?:p(?:isode)?)?\\.?\\s*#?0*${NUM}\\b`, 'gi'),
      (g, at) => add(toNum(g[0]), toNum(g[1]), at),
    );
    take(/\b(\d{1,2})\s?[x×]\s?(\d{2})\b/g, (g, at) => add(Number(g[0]), Number(g[1]), at));
    take(new RegExp(`\\b${NUM}(?:st|nd|rd|th)?\\s+season'?s?\\s+(?:ep(?:isode)?\\.?\\s*)?#?${NUM}\\b`, 'gi'), (g, at) =>
      add(toNum(g[0]), toNum(g[1]), at),
    );
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

  // Reddit's formatting marks (**bold**, __underline__, ~~strike~~, `code`, # headings, > quotes, [text](link))
  // as plain text, for showing.
  const unmark = (t) =>
    String(t || '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/(\*\*|__|~~|\*|`)/g, '')
      .replace(/^\s*(#{1,6}|>+)\s*/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();

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
        const r = await fetch(
          `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(show)}&embed=episodes`,
          { credentials: 'omit' },
        );
        if (r.ok) {
          const data = await r.json();
          const wiki = await wikiSummaries(data);
          // Only what we use: titles and summaries.
          raw = {
            at: Date.now(),
            name: data.name,
            episodes: (data._embedded?.episodes || []).map((e) => ({
              season: e.season,
              number: e.number,
              name: e.name,
              summary: e.summary || '',
            })),
            wiki: [...wiki],
          };
          if (store) {
            const keep = Object.fromEntries(
              Object.entries({ ...stored, [key]: raw })
                .sort((a, b) => b[1].at - a[1].at)
                .slice(0, 5),
            );
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
    const titles = [
      `List of ${name} episodes`,
      ...(seasons.length > 1 ? seasons.map((n) => `${name} season ${n}`) : []),
    ];
    try {
      const url =
        'https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&formatversion=2&redirects=1&origin=*' +
        `&titles=${encodeURIComponent(titles.join('|'))}`;
      const r = await fetch(url, { credentials: 'omit', headers: WIKI_AGENT });
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
      const field = (f) =>
        block.match(new RegExp(`\\|\\s*${f}\\s*=([\\s\\S]*?)(?=\\n\\s*\\|\\s*[A-Za-z0-9_]+\\s*=|\\n\\}\\})`))?.[1] ||
        '';
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

  const STOP = new Set(
    (
      'the and that this with from they them their there then than when what where which while were have has had ' +
      'just like really very much more most some also only even still into about after before over again because would could should ' +
      'episode episodes season seasons show series favorite favourite best watch watched watching scene scenes thing things time ' +
      "think thought good great love loved know your you are was but not for its it's one ones she her him his who how why all out " +
      'get got make made being been does did done can will well back first last next other another every each many such ' +
      'under over around through whole part moment lady guy girl woman women people person everyone someone something character ' +
      'characters actually literally always never ever still though tension stress stressed cried crying sad happy funny amazing favorit favourit episod'
    ).split(/\s+/),
  );
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
    for (let w of String(text || '')
      .toLowerCase()
      .replace(/<[^>]+>/g, ' ')
      .match(/[a-z]+/g) || []) {
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
      .map((e) => ({
        key: `S${e.season}E${e.number}`,
        season: e.season,
        number: e.number,
        name: String(e.name || '').trim(),
        text: `${String(e.summary || '').replace(/<[^>]+>/g, ' ')} ${wiki.get(`S${e.season}E${e.number}`) || ''}`
          .replace(/\s+/g, ' ')
          .trim(),
        words: stems(`${e.name} ${e.summary || ''} ${wiki.get(`S${e.season}E${e.number}`) || ''}`),
      }));
    if (!eps.length) return null;
    // How rare each word is across the show: "bomb" says a lot, the main characters' names don't.
    const df = new Map();
    for (const e of eps) for (const w of e.words) df.set(w, (df.get(w) || 0) + 1);
    const showWords = stems(data.name);
    const idf = (w) =>
      !df.has(w) || showWords.has(w) || df.get(w) > eps.length * 0.12 ? 0 : Math.log(eps.length / df.get(w));
    const byKey = new Map(eps.map((e) => [e.key, e]));
    // Titles worth looking for in comments: several words, or one long distinctive word, and not a
    // phrase the show's summaries use all the time ("Red John" is The Mentalist's villain, not just S6E8).
    const texts = (data?._embedded?.episodes || []).map(
      (e) => ` ${norm(`${e.summary || ''} ${wiki.get(`S${e.season}E${e.number}`) || ''}`)} `,
    );
    const titled = eps.filter((e) => {
      const long =
        e.name.split(/\s+/).length >= 2
          ? e.name.length >= 8
          : e.name.length >= 9 && !/^(pilot|chapter|episode|part)/i.test(e.name);
      if (!long) return false;
      const phrase = ` ${norm(e.name)} `;
      return texts.filter((t) => t.includes(phrase)).length <= 2;
    });
    return { name: data?.name || '', eps, byKey, idf, titled, seasons: new Set(eps.map((e) => e.season)).size };
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
    const clear =
      best.shared >= 2 ? best.score >= 7 && best.score >= second * 1.5 : best.score >= 5 && best.score >= second * 2;
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
    for (const c of comments)
      if (c.isPost && !about.has(c.url)) about.set(c.url, threadEpisode(c.threadTitle || '', guide));
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
      if (!found.length && topic && (c.isPost || c.topLevel))
        found = [{ key: topic, at: 0, described: false, fromThread: true }];
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
        const better =
          !t.best ||
          (t.best.fromThread && !fromThread) ||
          ((c.score || 0) > t.best.score && !(fromThread && !t.best.fromThread));
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
    const name = String(show || '')
      .trim()
      .slice(0, 100);
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
        title: unmark(d.title),
        sub: d.subreddit_name_prefixed,
        comments: d.num_comments,
        upvotes: d.score,
        url: `https://www.reddit.com${d.permalink}`,
        permalink: d.permalink,
        selftext: d.selftext || '',
        // Threads that name the show (and ask about episodes) first, then the busiest.
        fit:
          (norm(d.title).includes(want) || norm(d.subreddit).includes(want.replace(/ /g, '')) ? 2 : 0) +
          (/episode/i.test(d.title) ? 1 : 0),
      }))
      // Best fit first; among those, the most upvoted and busiest.
      .sort(
        (a, b) =>
          b.fit - a.fit ||
          Math.log10(1 + b.upvotes) +
            Math.log10(1 + b.comments) -
            (Math.log10(1 + a.upvotes) + Math.log10(1 + a.comments)),
      )
      .slice(0, THREADS);

    const comments = [];
    const guide = episodeGuide(name); // fetched alongside the threads
    await Promise.all(
      threads.map(async (t) => {
        // The post itself: its upvotes are votes for what its title says.
        comments.push({
          body: `${t.title}\n${t.selftext}`,
          score: t.upvotes,
          threadScore: t.upvotes,
          url: t.url,
          threadUrl: t.url,
          threadTitle: t.title,
          isPost: true,
        });
        try {
          const [, list] = await getJson(
            `${t.permalink.replace(/\/$/, '')}.json?sort=top&limit=150&depth=2&raw_json=1`,
          );
          const walk = (children, depth = 0) => {
            for (const c of children || []) {
              if (c.kind !== 't1' || !c.data?.body) continue;
              const replies = (c.data.replies?.data?.children || [])
                .filter((x) => x.kind === 't1' && x.data?.body)
                .map((x) => x.data.body);
              comments.push({
                body: c.data.body,
                replies,
                score: c.data.score,
                threadScore: t.upvotes,
                url: `https://www.reddit.com${c.data.permalink}`,
                threadUrl: t.url,
                topLevel: depth === 0,
              });
              if (c.data.replies?.data) walk(c.data.replies.data.children, depth + 1);
            }
          };
          walk(list?.data?.children);
        } catch {}
      }),
    );

    const result = {
      show: name,
      episodes: rank(comments, await guide),
      threads: threads.map(({ title, sub, comments: n, upvotes, url }) => ({ title, sub, comments: n, upvotes, url })),
      searchUrl: `https://www.reddit.com/search/?q=${q}`,
    };
    cache.set(norm(name), { at: Date.now(), result });
    return result;
  }

  // ---- Watch guide ----
  // "Which episodes do we actually need?" (optionally for one story: "Red John"). Built from a guide
  // thread you trust, Reddit's own guide threads, and episode summaries that mention the topic.

  // Episodes listed in a guide's text, in order: "S1E2", "1x02", "Season 2" headings with "Ep 4"
  // under them, or a line that starts with an episode's title.
  function listedIn(text, guide) {
    const out = [];
    let season = null;
    for (const raw of String(text || '').split(/\n+/)) {
      // (Reddit's bold/underline/strike/code marks off; a leading "*" bullet stays for the list check.)
      const line = raw
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/(\*\*|__|~~|`)/g, '')
        .trim();
      if (!line) continue;
      let keys = [...episodesIn(line).keys()];
      const heading = line.match(/^[#*_\s]*season\s+(\d{1,2})\b/i);
      if (heading && !keys.some((k) => k.startsWith('S'))) season = Number(heading[1]);
      if (season) keys = keys.map((k) => (k.startsWith('E') ? `S${season}${k}` : k));
      // "4. Red John's Friends – where it starts" under a season heading, or a bare title line
      const bare = line.replace(/^[\s>*\-+#|•·]*(\d{1,3}[.)]\s+)?/, '');
      if (!keys.length && season && /^(\d{1,3})[.)]\s/.test(line.replace(/^[\s>*\-+•·]*/, ''))) {
        const n = Number(line.replace(/^[\s>*\-+•·]*/, '').match(/^(\d{1,3})/)[1]);
        if (guide?.byKey.has(`S${season}E${n}`)) keys = [`S${season}E${n}`];
      }
      if (!keys.length && guide) {
        const b = ` ${norm(bare)} `;
        let match = null;
        for (const e of guide.eps) {
          const t = norm(e.name);
          if (t.length < 4 || !b.startsWith(` ${t} `) || (match && t.length <= norm(match.name).length)) continue;
          // The title has to stand alone ("Red John – the finale"), not open a sentence ("Red John watch guide").
          const after = bare.slice(e.name.length).trim();
          if (!after || /^[-–—:|(,.]/.test(after)) match = e;
        }
        if (match) keys = [match.key];
      }
      for (const key of keys) {
        if (!/^S\d+E\d+$/.test(key)) continue;
        // Why it's on the list: the line minus its numbering and the episode's title.
        let reason = bare
          .replace(/^season\s*\d+\s*[:\-–—]?\s*/i, '')
          .replace(/^(s\d+\s*e\d+|\d+x\d+|ep(isode)?\.?\s*\d+)\s*[-–—:|.]*\s*/i, '');
        const title = guide?.byKey.get(key)?.name || '';
        if (title && norm(reason).startsWith(norm(title))) reason = reason.slice(title.length);
        reason = cleanReason(reason, title);
        out.push({ key, reason: reason.length > 150 ? `${reason.slice(0, 150).replace(/\s\S*$/, '')}…` : reason });
      }
    }
    return out;
  }

  // A Reddit thread from any of its link forms: reddit.com/r/x/comments/id/…, old.reddit, redd.it/id.
  // -> { id, path } where path is the link's own path (with its title part, which Reddit's data
  // address needs), or { share } for the app's /s/ share links, which have to be followed first.
  function threadPath(link) {
    try {
      const u = new URL(String(link || '').trim());
      if (/(^|\.)redd\.it$/.test(u.hostname)) return { id: u.pathname.split('/')[1], path: null };
      if (!/(^|\.)reddit\.com$/.test(u.hostname)) return null;
      if (/^\/r\/[^/]+\/s\/\w+/.test(u.pathname)) return { share: u.href };
      const m = u.pathname.match(/^((?:\/r\/[^/]+)?\/comments\/([a-z0-9]+)(?:\/[^/?#]+)?)/i);
      return m ? { id: m[2], path: m[1] } : null;
    } catch {
      return null;
    }
  }

  // Find a thread's full address: follow a share link, or ask Reddit for it by id.
  async function resolveThread(ref) {
    if (ref.share) {
      const r = await fetch(ref.share, { credentials: 'include' });
      const real = threadPath(r.url);
      if (!real?.path) throw new Error(`reddit share ${r.status}`);
      return real;
    }
    const data = await getJson(`/by_id/t3_${ref.id}.json?raw_json=1`);
    const permalink = data?.data?.children?.[0]?.data?.permalink;
    if (!permalink) throw new Error('reddit: no such thread');
    return { id: ref.id, path: permalink.replace(/\/$/, '') };
  }

  async function readThread(ref) {
    if (typeof ref === 'string') ref = { path: ref };
    let data = null;
    let firstError = null;
    if (ref.path) {
      try {
        data = await getJson(`${ref.path}.json?sort=top&limit=200&depth=1&raw_json=1`);
      } catch (e) {
        firstError = e;
      }
    }
    if (!Array.isArray(data) && (ref.id || ref.share)) {
      const real = await resolveThread(ref).catch((e) => {
        throw firstError || e;
      });
      data = await getJson(`${real.path}.json?sort=top&limit=200&depth=1&raw_json=1`);
      ref = real;
    }
    if (!Array.isArray(data)) throw firstError || new Error('reddit: not a thread');
    const path = ref.path;
    const [post, list] = data;
    const d = post?.data?.children?.[0]?.data || {};
    const comments = (list?.data?.children || [])
      .filter((c) => c.kind === 't1' && c.data?.body)
      .map((c) => ({ body: c.data.body, score: c.data.score || 0, url: `https://www.reddit.com${c.data.permalink}` }));
    return {
      title: unmark(d.title),
      body: `${d.title || ''}\n${d.selftext || ''}`,
      sub: d.subreddit_name_prefixed || '',
      upvotes: d.score || 0,
      comments,
      url: `https://www.reddit.com${d.permalink || path}`,
    };
  }

  // ---- Fandom wikis ----
  // Most shows have a fan wiki with full episode pages and pages for big story events ("Ferry Crash",
  // "Hospital Shooting") that list the episodes they happen in. Its search understands topics like
  // "mass casualty" that episode summaries never spell out.
  const wikis = new Map(); // show -> { host, name } or null
  async function fandomJson(host, params) {
    const r = await fetch(`https://${host}/api.php?${params}&format=json&formatversion=2&origin=*`, {
      credentials: 'omit',
    });
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw new Error(`fandom ${r.status}`);
    return r.json();
  }
  async function findWiki(show, guide) {
    const key = norm(show);
    if (wikis.has(key)) return wikis.get(key);
    const names = [show, guide?.name].filter(Boolean);
    const slugs = [
      ...new Set(
        names.flatMap((n) => {
          const flat = norm(n).replace(/ /g, '');
          const dashed = norm(n).replace(/ /g, '-');
          return [flat, flat.replace(/^the/, ''), dashed, dashed.replace(/^the-/, '')];
        }),
      ),
    ].filter((x) => x.length >= 3);
    let wiki = null;
    for (const slug of slugs.slice(0, 6)) {
      try {
        const r = await fetch(
          `https://${slug}.fandom.com/api.php?action=query&meta=siteinfo&format=json&formatversion=2&origin=*`,
          { credentials: 'omit' },
        );
        if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) continue;
        const info = await r.json();
        if (info?.query?.general) {
          wiki = { host: new URL(r.url).host, name: info.query.general.sitename || `${show} Wiki` };
          break;
        }
      } catch {}
    }
    wikis.set(key, wiki);
    return wiki;
  }
  const plain = (html) =>
    String(html || '')
      .replace(/<[^>]+>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&#0?39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  // "Walk on Water", "The Other Side of This Life, Part 1", "Flight (episode)" -> the guide's episodes
  function episodesNamed(title, guide) {
    const base = (t) =>
      norm(
        String(t)
          .replace(/\s*\((episode|part \d+|\d+|[^)]*\bseason\b[^)]*)\)\s*$/i, '')
          .replace(/,?\s*part\s+\w+$/i, ''),
      );
    const want = base(title);
    return want ? guide.eps.filter((e) => base(e.name) === want) : [];
  }
  // -> [{ key, reason }] for a topic, from the wiki's search
  async function fandomTopic(wiki, topic, guide) {
    const found = [];
    const search = await fandomJson(
      wiki.host,
      `action=query&list=search&srsearch=${encodeURIComponent(topic)}&srlimit=40&srnamespace=0`,
    );
    const others = [];
    for (const r of search?.query?.search || []) {
      if (r.title.includes('/')) continue; // transcripts and sub-pages
      const eps = episodesNamed(r.title, guide);
      if (eps.length)
        for (const e of eps)
          found.push({
            key: e.key,
            reason: plain(r.snippet).slice(0, 150) || `Its wiki page mentions “${topic}”`,
            event: false,
          });
      else others.push(r.title);
    }
    // Event and story pages: the episodes their infobox lists.
    if (others.length) {
      const pages = await fandomJson(
        wiki.host,
        `action=query&prop=revisions&rvprop=content&rvslots=main&titles=${encodeURIComponent(others.slice(0, 15).join('|'))}`,
      );
      for (const pg of pages?.query?.pages || []) {
        const text = pg.revisions?.[0]?.slots?.main?.content || '';
        const field = text.match(/\|\s*episodes?\s*=([\s\S]*?)(?=\n\s*\|\s*[a-z_ ]+=|\n\}\})/i)?.[1];
        if (!field) continue;
        const caption = plain(
          text.match(/\|\s*caption\s*=\s*([^\n]*)/i)?.[1]?.replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1') || '',
        );
        for (const [, link] of field.matchAll(/\[\[([^|\]#]+)/g)) {
          for (const e of episodesNamed(link, guide))
            found.push({ key: e.key, reason: caption ? `${pg.title}: ${caption}` : pg.title, event: true });
        }
      }
    }
    return found;
  }

  // "earthquake, tsunami" -> both. "Mass casualty" (or MCI, disaster) is how fans talk about it, but
  // summaries and wikis say what happened, so it also looks for the usual disaster words.
  const DISASTER = [
    'earthquake',
    'tsunami',
    'derailment',
    'building collapse',
    'bridge collapse',
    'bridge collapses',
    'freeway collapse',
    'multiple victims',
    'mass shooting',
    'pileup',
    'plane crash',
    'bus crash',
    'train crash',
    'train derails',
    'mudslide',
    'dam break',
    'blackout',
    'cruise ship',
    'capsizes',
    'wildfire',
    'tornado',
    'hurricane',
    'sinkhole',
    'ferry',
    'explosion at',
  ];
  function topicTerms(topic) {
    const typed = String(topic || '')
      .split(/\s*(?:,|;|\/|\bor\b)\s*/i)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2);
    const out = [...typed];
    if (typed.some((t) => /mass casualt|\bmci\b|\bdisasters?\b/i.test(t))) out.push(...DISASTER);
    return [...new Set(out.map((t) => t.toLowerCase()))].slice(0, 20);
  }

  // "Greys Anatomy" is "Grey's Anatomy", "911" is "9-1-1", "mentalist" is "The Mentalist"; "MCU" is no TV show.
  function sameShow(a, b) {
    const flat = (s) => norm(s).replace(/^the /, '').replace(/ /g, '');
    return !!flat(a) && flat(a) === flat(b);
  }

  // ---- Watch order for a franchise (films and series) ----
  // The franchise's fan wiki has pages for sagas and phases whose infobox lists their films, series
  // and shorts in release order. Reddit watch-order threads add titles written like "Iron Man (2008)".
  const LIST_FIELDS = [
    [/^(films?|movies?)$/i, 'Films'],
    [/^(series|shows?|television|tv series|television series|disney\+ series|netflix series)$/i, 'Series'],
    [/^(one[- ]?shots?|short films?|shorts|specials?)$/i, 'Short films'],
  ];
  function listsIn(wikitext) {
    const out = [];
    for (const [, field, value] of wikitext.matchAll(
      /\n\s*\|\s*([a-z+ -]+?)\s*=([^\n]*(?:\n(?!\s*\||\}\})[^\n]*)*)/gi,
    )) {
      const kind = LIST_FIELDS.find(([re]) => re.test(field.trim()))?.[1];
      if (!kind) continue;
      for (const [, target, label] of value.matchAll(/\[\[([^|\]#]+)(?:\|([^\]]+))?\]\]/g)) {
        const title = plain(label || target)
          .replace(/\s*\((film|tv series|series|miniseries|\d{4}(?: film)?)\)$/i, '')
          .trim();
        if (title && !/^(category|file|image):/i.test(target) && !/^(season|series|volume|part) \d+$/i.test(title))
          out.push({ title, kind });
      }
    }
    return out;
  }
  // "1. Iron Man (2008)", "- Captain America: The First Avenger (2011) – set in WWII"
  function titlesIn(text) {
    const out = [];
    for (const raw of String(text || '').split(/\n+/)) {
      const line = raw
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[*_~`>]+/g, '')
        .trim();
      const m = line.match(/^(?:[-•·]\s*|\d{1,3}[.)]\s*)?([^()\n]{2,80}?)\s*\(((?:19|20)\d\d)\)/);
      if (m)
        out.push({
          title: m[1]
            .trim()
            .replace(/[:\-–—]+$/, '')
            .trim(),
          year: m[2],
        });
    }
    return out;
  }
  // Wikidata: a saga or film series and its parts (expanding trilogies and phases), by release date.
  // Wikimedia asks apps to say who they are.
  const WIKI_AGENT = { 'Api-User-Agent': 'Sinehan/2.12 (https://sinehan.live)' };
  const FILM_TYPES = new Set(['Q11424', 'Q24869', 'Q202866', 'Q506240', 'Q1054574', 'Q93204', 'Q229390', 'Q20650540']);
  const SERIES_TYPES = new Set([
    'Q5398426',
    'Q1259759',
    'Q581714',
    'Q117467246',
    'Q15416',
    'Q63952888',
    'Q21191270',
    'Q526877',
  ]);
  async function wikidata(params) {
    const r = await fetch(`https://www.wikidata.org/w/api.php?format=json&origin=*&${params}`, {
      credentials: 'omit',
      headers: WIKI_AGENT,
    });
    if (!r.ok) throw new Error(`wikidata ${r.status}`);
    return r.json();
  }
  async function wdEntities(ids) {
    const out = {};
    for (let i = 0; i < ids.length; i += 50) {
      Object.assign(
        out,
        (
          await wikidata(
            `action=wbgetentities&languages=en|mul&props=labels|claims&ids=${ids.slice(i, i + 50).join('|')}`,
          )
        ).entities || {},
      );
    }
    return out;
  }
  const wdVals = (e, p) => (e?.claims?.[p] || []).map((c) => c.mainsnak?.datavalue?.value).filter(Boolean);
  const wdLabel = (e) => e?.labels?.en?.value || e?.labels?.mul?.value || '';
  async function wikidataParts(queries) {
    for (const q of queries) {
      const found = await wikidata(`action=wbsearchentities&language=en&limit=6&search=${encodeURIComponent(q)}`);
      const ids = (found.search || []).map((x) => x.id);
      if (!ids.length) continue;
      const cands = await wdEntities(ids);
      // The first match whose parts are mostly films and series (not, say, the novel's six books).
      for (const root of ids.map((id) => cands[id]).filter((e) => wdVals(e, 'P527').length >= 2)) {
        let level = wdVals(root, 'P527').map((v) => v.id);
        const leaves = [];
        for (let depth = 0; depth < 3 && level.length && leaves.length < 150; depth++) {
          const ents = await wdEntities(level);
          const next = [];
          for (const id of level) {
            const e = ents[id];
            const types = wdVals(e, 'P31').map((v) => v.id);
            const sub = wdVals(e, 'P527').map((v) => v.id);
            const isWork = types.some((t) => FILM_TYPES.has(t) || SERIES_TYPES.has(t));
            if (sub.length && !isWork) next.push(...sub);
            else if (wdLabel(e))
              leaves.push({
                title: wdLabel(e),
                kind: types.some((t) => SERIES_TYPES.has(t)) ? 'Series' : 'Films',
                work: isWork,
                date:
                  wdVals(e, 'P577')
                    .map((v) => v.time)
                    .sort()[0] || '',
              });
          }
          level = next;
        }
        const works = leaves.filter((l) => l.work);
        if (works.length >= 2 && works.length >= leaves.length / 2)
          return { name: wdLabel(root), id: root.id, leaves: works.sort((a, b) => a.date.localeCompare(b.date)) };
      }
    }
    return null;
  }

  async function franchiseGuide(name, topic, link) {
    const items = new Map(); // norm(title) -> item
    const threads = [];
    const problems = [];
    const add = (title, kind, source, reason = '') => {
      const id = norm(title);
      if (!id) return;
      if (!items.has(id))
        items.set(id, { title, kind, order: items.size, wiki: false, pasted: false, guides: new Set(), reason });
      const it = items.get(id);
      if (source === 'wiki') it.wiki = true;
      else if (source) it.guides.add(source);
      if (!it.reason && reason) it.reason = reason;
      return it;
    };

    // 1. The fan wiki: the best-matching saga/phase page with lists of films and series.
    try {
      const wiki = await findWiki(name, null);
      if (wiki) {
        const search = await fandomJson(
          wiki.host,
          `action=query&list=search&srsearch=${encodeURIComponent(topic || name)}&srlimit=6&srnamespace=0`,
        );
        const titles = (search?.query?.search || [])
          .map((r) => r.title)
          .filter((t) => !t.includes('/'))
          .slice(0, 5);
        if (titles.length) {
          const pages = await fandomJson(
            wiki.host,
            `action=query&prop=revisions&rvprop=content&rvslots=main&titles=${encodeURIComponent(titles.join('|'))}`,
          );
          const byTitle = new Map(
            (pages?.query?.pages || []).map((p) => [p.title, p.revisions?.[0]?.slots?.main?.content || '']),
          );
          for (const t of titles) {
            const lists = listsIn(byTitle.get(t) || '');
            if (lists.length < 2) continue;
            for (const { title, kind } of lists) add(title, kind, 'wiki', '');
            threads.push({
              title: `${wiki.name}: ${t}`,
              sub: 'fandom.com',
              upvotes: 0,
              comments: 0,
              pasted: false,
              url: `https://${wiki.host}/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}`,
            });
            break;
          }
        }
      }
    } catch {}

    // 1b. No list on a fan wiki: Wikidata's parts of the saga or film series, by release date.
    if (!items.size) {
      try {
        const parts = await wikidataParts([
          ...new Set([topic, topic && `${name} ${topic}`, name, `${name} film series`].filter(Boolean)),
        ]);
        if (parts) {
          for (const { title, kind, date } of parts.leaves) add(title, kind, 'wiki', date.slice(1, 5));
          threads.push({
            title: `Wikidata: ${parts.name}`,
            sub: 'wikidata.org',
            upvotes: 0,
            comments: 0,
            pasted: false,
            url: `https://www.wikidata.org/wiki/${parts.id}`,
          });
        }
      } catch {}
    }

    // 2. A watch-order thread you pasted, and Reddit's top ones.
    const useThread = (t, pasted) => {
      threads.push({ title: t.title, sub: t.sub, upvotes: t.upvotes, comments: t.comments.length, url: t.url, pasted });
      const listed = titlesIn(t.body);
      for (const { title, year } of listed) {
        const it = add(title, 'Films', t.url, year);
        if (it && pasted) it.pasted = true;
      }
      return listed.length;
    };
    const path = link ? threadPath(link) : null;
    if (link && !path) problems.push('That link isn’t a Reddit thread.');
    if (path) {
      try {
        if (!useThread(await readThread(path), true))
          problems.push('Your thread didn’t list titles we could read (like “Iron Man (2008)”).');
      } catch (e) {
        problems.push(
          `Reddit didn’t open your thread (${String(e?.message || e).replace(/^reddit\s*/, '') || 'no answer'}).`,
        );
      }
    }
    if (!items.size || topic) {
      try {
        const q = `${name} ${topic} watch order`.replace(/\s+/g, ' ');
        const search = await getJson(
          `/search.json?q=${encodeURIComponent(q)}&sort=relevance&t=all&type=link&limit=25&raw_json=1`,
        );
        const found = (search?.data?.children || [])
          .map((c) => c.data)
          .filter(
            (d) =>
              d &&
              !d.over_18 &&
              /order|guide|list|watch/i.test(d.title) &&
              (!topic || norm(`${d.title} ${d.selftext}`).includes(norm(topic))),
          )
          .sort((a, b) => b.score - a.score)
          .slice(0, 2);
        await Promise.all(
          found.map(async (d) => {
            try {
              useThread(await readThread(d.permalink.replace(/\/$/, '')), false);
            } catch {}
          }),
        );
      } catch {}
    }

    // In: from the wiki or your thread, or listed by 2+ Reddit guides.
    const kinds = ['Films', 'Series', 'Short films'];
    const episodes = [...items.values()]
      .filter((it) => it.wiki || it.pasted || it.guides.size >= 2)
      .sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind) || a.order - b.order)
      .slice(0, 150)
      .map((it) => ({
        key: `T:${norm(it.title).slice(0, 100)}`,
        kind: it.kind,
        order: it.order,
        season: 0,
        number: 0,
        label: it.kind === 'Films' ? 'Film' : it.kind === 'Series' ? 'Series' : 'Short',
        title: it.title,
        pasted: it.pasted,
        guides: it.guides.size,
        comments: 0,
        summary: false,
        fandom: it.wiki,
        reason: it.reason,
        url: '',
      }));
    if (!episodes.length)
      problems.push(
        `Couldn’t find a list for “${topic || name}”. Try the saga or phase name (like “Infinity Saga”), or paste a watch-order thread.`,
      );
    const wikiHost = (await findWiki(name, null).catch(() => null))?.host || '';
    return { show: name, topic, episodes, threads, problems, hasGuide: false, franchise: true, wiki: wikiHost };
  }

  async function watchGuide(show, topic = '', link = '') {
    const name = String(show || '')
      .trim()
      .slice(0, 100);
    if (!name) throw new Error('no show');
    topic = String(topic || '')
      .trim()
      .slice(0, 100);
    const terms = topicTerms(topic);
    // A single TV series has an episode list; a franchise ("MCU") gets a watch order of films and series.
    const found = await episodeGuide(name);
    const guide = found && sameShow(found.name, name) ? found : null;
    if (!guide) return franchiseGuide(name, topic, link);
    const entries = new Map(); // key -> { key, pasted, guides: Set, comments, summary, reason, url }
    const entry = (key) => {
      if (!entries.has(key))
        entries.set(key, {
          key,
          pasted: false,
          guides: new Set(),
          comments: 0,
          summary: false,
          fandom: false,
          reason: '',
          url: '',
        });
      return entries.get(key);
    };
    const threads = [];
    const problems = [];

    // A guide's post lists the episodes; its comments add ones people say it missed.
    const useThread = (t, pasted) => {
      threads.push({ title: t.title, sub: t.sub, upvotes: t.upvotes, comments: t.comments.length, url: t.url, pasted });
      const listed = listedIn(t.body, guide);
      for (const { key, reason } of listed) {
        const e = entry(key);
        if (pasted) e.pasted = true;
        e.guides.add(t.url);
        if (reason && (!e.reason || (pasted && !e.fromPasted))) {
          e.reason = reason;
          e.url = t.url;
          e.fromPasted = pasted;
        }
      }
      for (const c of t.comments.slice(0, 60)) {
        for (const { key, reason } of listedIn(c.body, guide)) {
          const e = entry(key);
          e.comments += 1;
          e.commentVotes = (e.commentVotes || 0) + Math.max(0, c.score);
          if (!e.reason && reason) {
            e.reason = reason;
            e.url = c.url;
          }
        }
      }
      return listed.length;
    };

    // 1. The thread you pasted.
    const path = link ? threadPath(link) : null; // { id, path } or { share }
    if (link && !path) problems.push('That link isn’t a Reddit thread.');
    if (path) {
      try {
        if (!useThread(await readThread(path), true))
          problems.push('Your thread didn’t list episodes we could read, so other guides were used too.');
      } catch (e) {
        problems.push(
          `Reddit didn’t open your thread (${String(e?.message || e).replace(/^reddit\s*/, '') || 'no answer'}). Open it once on reddit.com in this browser, then try again.`,
        );
      }
    }

    // 2. Reddit's own guide threads.
    try {
      const q = `${name} ${topic || 'essential'} episodes guide`;
      const search = await getJson(
        `/search.json?q=${encodeURIComponent(q)}&sort=relevance&t=all&type=link&limit=25&raw_json=1`,
      );
      const want = norm(name);
      const pastedId = path?.id;
      const found = (search?.data?.children || [])
        .map((c) => c.data)
        .filter(
          (d) =>
            d &&
            !d.over_18 &&
            d.id !== pastedId &&
            /guide|essential|must|important|skip|list|order|arc|episodes|watch/i.test(d.title),
        )
        .filter((d) => norm(d.title).includes(want) || norm(d.subreddit).includes(want.replace(/ /g, '')))
        .filter((d) => !topic || norm(`${d.title} ${d.selftext}`).includes(norm(topic)))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      await Promise.all(
        found.map(async (d) => {
          try {
            useThread(await readThread(d.permalink.replace(/\/$/, '')), false);
          } catch {}
        }),
      );
    } catch {
      if (!path) problems.push('Reddit didn’t answer, so this is from episode summaries only.');
    }

    // 3. Episodes whose summary mentions the topic (any of its terms).
    if (terms.length && guide) {
      for (const ep of guide.eps) {
        const text = ` ${norm(ep.text)} `;
        const term = terms.find((t) => text.includes(` ${norm(t)} `));
        if (!term) continue;
        const e = entry(ep.key);
        e.summary = true;
        e.summaryTerm ||= term;
        if (!e.reason) {
          const sentence = ep.text.split(/(?<=[.!?])\s+/).find((x) => ` ${norm(x)} `.includes(` ${norm(term)} `)) || '';
          e.reason = sentence.length > 150 ? `${sentence.slice(0, 150).replace(/\s\S*$/, '')}…` : sentence;
        }
      }
    }

    // 4. The show's fan wiki (for a topic).
    if (topic && guide) {
      try {
        const wiki = await findWiki(name, guide);
        if (wiki) {
          // What you typed first, then (for "mass casualty") the disaster words; a few searches at most.
          // Words you typed count any wiki page that mentions them; the extra disaster words only count
          // event pages' episode lists (an episode page just mentioning "the earthquake" isn't about it).
          const typed = topicTerms(topic.replace(/mass casualt\w*|mci|disasters?/gi, '')).length
            ? terms.filter((t) => !DISASTER.includes(t))
            : terms.filter((t) => !DISASTER.includes(t));
          const hits = (
            await Promise.all(
              terms.slice(0, 6).map((t) =>
                fandomTopic(wiki, t, guide)
                  .then((list) => list.filter((h) => h.event || typed.includes(t)))
                  .catch(() => []),
              ),
            )
          ).flat();
          for (const { key, reason } of hits) {
            const e = entry(key);
            e.fandom = true;
            if (!e.reason && reason) e.reason = reason;
          }
          if (hits.length) {
            threads.push({
              title: `${wiki.name}: “${topic}”`,
              sub: 'fandom.com',
              upvotes: 0,
              comments: 0,
              pasted: false,
              url: `https://${wiki.host}/wiki/Special:Search?query=${encodeURIComponent(topic)}`,
            });
          }
        }
      } catch {}
    }

    // In: listed by your thread, a guide or the fan wiki, said by 2+ comments, or (for a topic) in a summary.
    const episodes = [...entries.values()]
      .filter((e) => e.pasted || e.guides.size || e.comments >= 2 || e.summary || e.fandom)
      .filter((e) => !guide || guide.byKey.has(e.key))
      .map((e) => {
        const [, s, n] = e.key.match(/^S(\d+)E(\d+)$/);
        return {
          key: e.key,
          season: Number(s),
          number: Number(n),
          label: label(e.key),
          title: guide?.byKey.get(e.key)?.name || '',
          pasted: e.pasted,
          guides: e.guides.size,
          comments: e.comments,
          summary: e.summary,
          summaryTerm: e.summaryTerm || '',
          fandom: e.fandom,
          reason: e.reason,
          url: e.url,
        };
      })
      .sort((a, b) => a.season - b.season || a.number - b.number);
    // Nothing as a TV series ("Harry Potter" is also a TV special): try it as films instead.
    if (!episodes.length && !link) {
      const films = await franchiseGuide(name, topic, link);
      if (films.episodes.length) return films;
    }
    // The show's fan wiki, so a guide's episodes can link to their pages.
    const wikiHost = (await findWiki(name, guide).catch(() => null))?.host || '';
    return { show: name, topic, episodes, threads, problems, hasGuide: !!guide, wiki: wikiHost };
  }

  // Text from a guide post, readable: no formatting marks, escapes, spoiler tags or emoji markers.
  function cleanReason(text, title = '') {
    let t = String(text || '')
      .replace(/>!(.*?)!</g, '$1')
      .replace(/>!|!</g, '') // spoiler tags (and unclosed ones)
      .replace(/\\([\\`*_{}\[\]()#+\-.!>~|])/g, '$1') // markdown escapes like \-
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links
      .replace(/(\*\*|__|~~|`)/g, '') // bold, underline, strike, code
      .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍]/gu, '') // emoji markers
      .replace(/^\s*(#{1,6}|>+)\s*/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
    // The card already shows the episode and its title: drop them from the front.
    t = t.replace(/^[\s*>•·\-–—]*(s\d+\s*e\d+|\d{1,2}\s*[x×]\s*\d{1,3}|ep(isode)?\.?\s*\d+)\s*[-–—:|.]*\s*/i, '');
    const flat = (x) =>
      String(x || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, '');
    if (title && flat(t).startsWith(flat(title))) {
      let i = 0;
      for (let n = 0; i < t.length && n < flat(title).length; i++) if (/[\p{L}\p{N}]/u.test(t[i])) n++;
      t = t.slice(i);
    }
    return t.replace(/^[\s\-–—:|,.*!]+/, '').trim();
  }

  const api = {
    episodeGuide,
    cleanReason,
    bestEpisodes,
    watchGuide,
    listedIn,
    threadPath,
    findWiki,
    fandomTopic,
    episodesNamed,
    listsIn,
    titlesIn,
    sameShow,
    episodesIn,
    rank,
    label,
    snippet,
    makeGuide,
    wikiSummaries,
    describedIn,
    titleIn,
    stems,
    searchUrl: (show) => `https://www.reddit.com/search/?q=${encodeURIComponent(`${show} best episodes`)}`,
  };
  if (typeof module !== 'undefined') module.exports = api;
  else self.Reddit = api;
})();
