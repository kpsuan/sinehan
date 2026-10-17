// Sinehan on Cloudflare. Live connections (the extension, the phone remote, guide pages) go to the Relay
// Durable Object; the APIs answer here; everything else is the website (static assets).
import { gifs, deck, ice } from './api.js';
export { Relay } from './relay.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // The live relay: one Durable Object for all parties, created in Asia (where Sinehan's people are).
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const stub = env.RELAY.get(env.RELAY.idFromName('relay'), { locationHint: 'apac' });
      return stub.fetch(request);
    }

    if (url.pathname === '/health') return new Response('watch-party relay ok');
    if (url.pathname === '/gifs') return gifs(url, env);
    if (url.pathname === '/deck') return deck(url, request, env);
    if (url.pathname === '/ice') return ice(env);

    // The extension itself, for the landing page's Download button.
    if (url.pathname === '/download') {
      const file = await env.ASSETS.fetch(new Request(new URL('/files/sinehan-extension.zip', url)));
      if (!file.ok) return new Response('Not found', { status: 404 });
      return new Response(file.body, {
        headers: {
          'content-type': 'application/zip',
          'content-disposition': 'attachment; filename="sinehan-extension.zip"',
          'cache-control': 'no-cache',
        },
      });
    }

    // The pages (/, /join, /party, /guide, /privacy) and their files (/static/…).
    const page = await env.ASSETS.fetch(request);
    if (page.status === 404) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
    if (!url.pathname.startsWith('/static/')) return page;
    const headers = new Headers(page.headers);
    headers.set('cache-control', 'public, max-age=3600');
    return new Response(page.body, { status: page.status, headers });
  },
};
