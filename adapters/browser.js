// DOM access is isolated to this browser adapter. Not shipped in the tt build.
export function createBrowserPlatform(canvas, host = window, audioPaths = {}) {
  const listeners = { pointer: new Set(), resize: new Set(), pause: new Set(), resume: new Set() };
  const removers = [];
  const emit = (name, value) => listeners[name].forEach(fn => fn(value));
  const subscribe = name => fn => { listeners[name].add(fn); return () => listeners[name].delete(fn); };
  const listen = (target, name, fn) => { target.addEventListener(name, fn); removers.push(() => target.removeEventListener(name, fn)); };
  let size;
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const css=typeof host.getComputedStyle==='function'?host.getComputedStyle(canvas):null;
    const safeInsets=Object.fromEntries(['top','right','bottom','left'].map(edge=>[edge,Math.max(0,parseFloat(css?.getPropertyValue?.('--safe-'+edge))||0)]));
    size = { width: rect.width, height: rect.height, dpr: Math.min(host.devicePixelRatio || 1, 3), safeInsets };
    canvas.width = Math.round(size.width * size.dpr);
    canvas.height = Math.round(size.height * size.dpr);
    emit('resize', { ...size });
  }
  resize();
  listen(host, 'resize', resize);
  for (const [event, type] of [['pointerdown','down'],['pointermove','move'],['pointerup','up'],['pointercancel','cancel']]) {
    listen(canvas, event, e => {
      if (type === 'down') canvas.setPointerCapture?.(e.pointerId);
      const rect = canvas.getBoundingClientRect();
      emit('pointer', { type, x: (e.clientX - rect.left) * size.width / rect.width, y: (e.clientY - rect.top) * size.height / rect.height, id: e.pointerId });
    });
  }
  let muted = false;
  const sounds = new Map();
  const audio = {
    play(name) {
      if (muted || !audioPaths[name]) return;
      try {
        let sound = sounds.get(name);
        if (!sound) { sound = new host.Audio(audioPaths[name]); sounds.set(name, sound); }
        sound.currentTime = 0;
        const pending = sound.play();
        if (pending?.catch) pending.catch(() => {});
      } catch { /* Audio failure must not block play. */ }
    },
    setMuted(value) { muted = Boolean(value); if (muted) sounds.forEach(sound => sound.pause()); }
  };
  listen(host,'pagehide',()=>{sounds.forEach(sound=>sound.pause());emit('pause');});
  listen(host,'pageshow',event=>{if(event.persisted){resize();emit('resume');}});
  listen(host.document, 'visibilitychange', () => {
    if (host.document.hidden) { sounds.forEach(sound => sound.pause()); emit('pause'); }
    else { resize(); emit('resume'); }
  });
  return {
    canvas, getSize: () => ({ ...size, safeInsets:{...size.safeInsets} }),
    onPointer: subscribe('pointer'), onResize: subscribe('resize'), onPause: subscribe('pause'), onResume: subscribe('resume'),
    requestFrame: fn => host.requestAnimationFrame(fn), cancelFrame: id => host.cancelAnimationFrame(id),
    storage: { getItem: key => host.localStorage.getItem(key), setItem: (key, value) => host.localStorage.setItem(key, value) },
    audio,
    destroy() { removers.forEach(fn => fn()); sounds.forEach(sound => sound.pause()); Object.values(listeners).forEach(set => set.clear()); }
  };
}
