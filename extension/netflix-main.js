// Runs in Netflix's page context to reach its player: seeking (setting the video's time directly
// crashes Netflix) and reading what's playing (name + artwork) for invite links.
window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.source !== 'watch-party') return;
  if (typeof e.data.seekMs === 'number') {
    try {
      const vp = window.netflix.appContext.state.playerApp.getAPI().videoPlayer;
      const player = vp.getVideoPlayerBySessionId(vp.getAllPlayerSessionIds()[0]);
      player.seek(Math.round(e.data.seekMs));
    } catch (err) {
      console.warn('[watch-party] Netflix seek failed', err);
    }
  } else if (e.data.want === 'meta') {
    window.postMessage({ source: 'watch-party-reply', nonce: e.data.nonce, meta: playerMeta(e.data.id) }, '*');
  }
});

// Best effort: Netflix's player keeps metadata for what's playing. Its shape isn't documented, so we
// look for a title and an artwork URL wherever they turn up.
function playerMeta(id) {
  try {
    const api = window.netflix.appContext.state.playerApp.getAPI();
    const md = api.getVideoMetadataByVideoId?.(Number(id));
    const v = md?._video || md?.video || md?._metadata?.video || md;
    const art = (list) => (Array.isArray(list) ? list.find((a) => /^https:\/\//.test(a?.url || ''))?.url : '') || '';
    const title = typeof v?.title === 'string' ? v.title : '';
    const image = art(v?.storyart) || art(v?.artwork) || art(v?.boxart) || art(v?.interestingMoment) || '';
    return { title, image };
  } catch {
    return { title: '', image: '' };
  }
}
