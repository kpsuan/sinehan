// Runs in Netflix's own page context so it can reach their player API for seeking.
window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.source !== 'watch-party') return;
  try {
    const vp = window.netflix.appContext.state.playerApp.getAPI().videoPlayer;
    const player = vp.getVideoPlayerBySessionId(vp.getAllPlayerSessionIds()[0]);
    player.seek(Math.round(e.data.seekMs));
  } catch (err) {
    console.warn('[watch-party] Netflix seek failed', err);
  }
});
