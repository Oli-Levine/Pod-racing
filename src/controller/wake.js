// Keep the phone screen awake.
// navigator.wakeLock needs a secure context (HTTPS or localhost); over plain
// http://192.168.x.x it is usually missing, so we fall back to a tiny looping
// video trick. If both fail, raise the phone's screen timeout manually (README).
let lock = null, video = null, status = 'off';
const listeners = new Set();
const set = (s) => { status = s; listeners.forEach((f) => f(s)); };

export const wake = {
  get status() { return status; },
  onChange(f) { listeners.add(f); },
  async enable() {
    try {
      if ('wakeLock' in navigator) {
        lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => { if (status === 'lock') set('off'); });
        set('lock');
        return;
      }
    } catch {}
    try {
      if (!video) {
        const c = document.createElement('canvas'); c.width = c.height = 8;
        const g = c.getContext('2d'); let k = 0;
        setInterval(() => { g.fillStyle = (k++ & 1) ? '#000' : '#010101'; g.fillRect(0, 0, 8, 8); }, 500);
        video = document.createElement('video');
        video.muted = true; video.playsInline = true; video.setAttribute('playsinline', '');
        video.srcObject = c.captureStream(2);
        video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.02;pointer-events:none';
        document.body.appendChild(video);
      }
      await video.play();
      set('video');
    } catch { set('none'); }
  },
};

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (status === 'off' || status === 'lock')) wake.enable();
});
