// One-time camera/mic grant for the extension (the side panel can't show the prompt itself).
async function ask() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    stream.getTracks().forEach((t) => t.stop());
    document.getElementById('msg').textContent =
      'All set! Closing this tab — go back to the sidebar and start the call.';
    document.getElementById('retry').hidden = true;
    setTimeout(() => window.close(), 1500);
  } catch (e) {
    document.getElementById('msg').textContent =
      e.name === 'NotAllowedError'
        ? 'Access was blocked. Click the camera icon in the address bar, choose “Always allow”, then click Ask again.'
        : `Couldn’t access your camera: ${e.message || e.name}`;
  }
}
document.getElementById('retry').onclick = ask;
ask();
