// Sinehan on Cloudflare. Live connections (the extension, the phone remote, guide pages) go to the Relay
// Durable Object; the APIs answer here; everything else is the website (static assets).
import { gifs, deck, ice } from './api.js';
export { Relay } from './relay.js';

// The relay's name. A Durable Object lives where it was first created (near whoever reached it first);
// this one was created from Singapore, next to where Sinehan's people connect.
const RELAY_NAME = 'sin-2';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // The live relay: one Durable Object for all parties, created in Asia (where Sinehan's people are).
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      return env.RELAY.get(env.RELAY.idFromName(RELAY_NAME)).fetch(request);
    }

    if (url.pathname === '/health') return new Response('watch-party relay ok');
    // Where the relay (and this request's Cloudflare entry point) actually are: for checking speed.
    if (url.pathname === '/where') {
      const name = url.searchParams.get('name') || RELAY_NAME;
      const stub = env.RELAY.get(env.RELAY.idFromName(name));
      const relay = await (await stub.fetch(new Request('https://relay/where'))).text();
      return Response.json({ entry: request.cf?.colo || '', relay });
    }
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
