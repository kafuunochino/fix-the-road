import { createRewardedService } from './rewarded.js';
import { createDouyinSidebar } from './douyin-sidebar.js';
// No browser globals. tt and the frame scheduler are explicitly injected.
export function createTTPlatform(api, scheduler, audioPaths = {}) {
  const sidebar = createDouyinSidebar(api); // Register newest onShow before game boot.
  const rewards=createRewardedService(); // No real ad unit or monetization activation.
  const canvas = api.createCanvas(); // Exactly one on-screen canvas.
  const listeners = { pointer: new Set(), resize: new Set(), pause: new Set(), resume: new Set() };
  const removers = [];
  const sounds = new Map();
  const emit = (name, value) => listeners[name].forEach(fn => fn(value));
  const subscribe = name => fn => { listeners[name].add(fn); return () => listeners[name].delete(fn); };
  const bind = (on, off, fn) => { if (typeof api[on] === 'function') { api[on](fn); removers.push(() => { if (typeof api[off] === 'function') api[off](fn); }); } };
  let size;
  function resize(event) {
    const info = api.getSystemInfoSync();
    // Native on-screen Canvas is screen-sized (not a DOM canvas). Explicit
    // resize-event dimensions win for hosts with a resized game container.
    const changed=event?.size||event||{};
    const positive=n=>Number.isFinite(Number(n))&&Number(n)>0?Number(n):0;
    const width=positive(changed.windowWidth)||positive(info.screenWidth)||positive(info.windowWidth);
    const height=positive(changed.windowHeight)||positive(info.screenHeight)||positive(info.windowHeight),area=info.safeArea||{};
    const bounded=(n,max)=>Math.max(0,Math.min(Number(n)||0,max));
    const safeInsets={top:bounded(area.top,height/3),left:bounded(area.left,width/4),right:bounded(width-(area.right??((area.left||0)+(area.width||width))),width/4),bottom:bounded(height-(area.bottom??((area.top||0)+(area.height||height))),height/3)};
    // Some hosts place their own menu capsule below the OS notch area.
    // Reserve its bottom edge when the optional host API is available.
    try { const menu=typeof api.getMenuButtonLayout==='function'?api.getMenuButtonLayout():api.getMenuButtonBoundingClientRect?.(); if(Number.isFinite(menu?.bottom)&&menu.bottom>0)safeInsets.top=Math.max(safeInsets.top,bounded(menu.bottom+8,height/3)); } catch { /* Optional capability; keep the OS safe area. */ }
    const next = { width, height, dpr: Math.min(info.pixelRatio || 1, 3), safeInsets };
    if (!(next.width > 0 && next.height > 0)) throw new Error('Platform viewport dimensions are missing');
    if (size && next.width === size.width && next.height === size.height && next.dpr === size.dpr && JSON.stringify(next.safeInsets)===JSON.stringify(size.safeInsets)) return;
    size = next;
    canvas.width = Math.round(size.width * size.dpr);
    canvas.height = Math.round(size.height * size.dpr);
    emit('resize', { ...size });
  }
  resize();
  for (const [suffix, type] of [['Start','down'],['Move','move'],['End','up'],['Cancel','cancel']]) {
    bind('onTouch' + suffix, 'offTouch' + suffix, event => {
      const touches = event.changedTouches?.length ? event.changedTouches : event.touches || [];
      touches.forEach(touch => emit('pointer', { type, x: touch.clientX, y: touch.clientY, id: touch.identifier }));
    });
  }
  let muted = false, audioPaused = false, audioDestroyed = false;
  const safeAudioCall = (sound, method, ...args) => { try { if (typeof sound[method] === 'function') sound[method](...args); } catch (_) { /* A broken optional audio method must not interrupt game lifecycle. */ } };
  const stopAudio = () => sounds.forEach(sound => safeAudioCall(sound, 'pause'));
  bind('onHide', 'offHide', () => { audioPaused = true; stopAudio(); emit('pause'); });
  bind('onShow', 'offShow', () => { audioPaused = false; resize(); emit('resume'); });
  // Optional onWindowResize on hosts that expose it; unsupported hosts still
  // refresh dimensions on every onShow. Never multiply touch coordinates by DPR.
  bind('onWindowResize', 'offWindowResize', resize);
  return {
    canvas, sidebar, rewards, getSize: () => ({ ...size }),
    onPointer: subscribe('pointer'), onResize: subscribe('resize'), onPause: subscribe('pause'), onResume: subscribe('resume'),
    requestFrame: fn => scheduler.requestAnimationFrame(fn), cancelFrame: id => scheduler.cancelAnimationFrame(id),
    storage: {
      getItem(key) { const value = api.getStorageSync(key); return value === undefined || value === null || value === '' ? null : String(value); },
      setItem(key, value) { api.setStorageSync(key, String(value)); }
    },
    audio: {
      play(name) {
        if (muted || audioPaused || audioDestroyed || !audioPaths[name] || typeof api.createInnerAudioContext !== 'function') return;
        try {
          let sound = sounds.get(name);
          if (!sound) { sound = api.createInnerAudioContext(); sound.src = audioPaths[name]; sound.onError?.(() => {}); sounds.set(name, sound); }
          safeAudioCall(sound, 'seek', 0); safeAudioCall(sound, 'play');
        } catch { /* Audio failure must not block play. */ }
      },
      setMuted(value) { muted = Boolean(value); if (muted) stopAudio(); }
    },
    destroy() { if (audioDestroyed) return; audioDestroyed = true; stopAudio(); rewards.destroy(); sidebar.destroy(); removers.forEach(fn => fn()); sounds.forEach(sound => safeAudioCall(sound, 'destroy')); sounds.clear(); Object.values(listeners).forEach(set => set.clear()); }
  };
}
