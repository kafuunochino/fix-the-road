/** Actual optional Douyin sidebar capability. No reward or navigation is implied by a successful API callback. */
export function createDouyinSidebar(tt) {
  let state = { available: false, checked: false, enteredFromSidebar: false, pending: false, error: null };
  let destroyed = false, finishPending = null;
  const listeners = new Set();
  const update = patch => {
    if (destroyed) return;
    state = { ...state, ...patch };
    listeners.forEach(fn => fn({ ...state }));
  };
  const onShow = options => {
    const entered = !!options && options.launch_from === 'homepage' && options.location === 'sidebar_card';
    // Every foreground event replaces the prior entry state, including ordinary resumes.
    update({ enteredFromSidebar: entered });
    if (finishPending) finishPending(entered, entered ? null : 'Navigation did not return through sidebar');
  };
  // Subscribe synchronously before canvas or game creation, as required by the platform guide.
  if (typeof tt.onShow === 'function') tt.onShow(onShow);
  if (typeof tt.checkScene === 'function' && typeof tt.navigateToScene === 'function') {
    try {
      tt.checkScene({
        scene: 'sidebar',
        success: result => update({ checked: true, available: !!result && result.isExist === true, error: null }),
        fail: result => update({ checked: true, available: false, error: result && result.errMsg || 'Sidebar capability check failed' })
      });
    } catch (_error) { update({ checked: true, available: false, error: 'Sidebar capability check failed' }); }
  } else update({ checked: true, available: false });
  return {
    getState: () => ({ ...state }),
    subscribe(fn) { if (destroyed) return () => {}; listeners.add(fn); return () => listeners.delete(fn); },
    navigate() {
      if (destroyed || !state.available || state.pending) return Promise.resolve(false);
      update({ pending: true, error: null });
      return new Promise(resolve => {
        let settled = false;
        const finish = (ok, error = null) => {
          if (settled) return;
          settled = true;
          if (finishPending === finish) finishPending = null;
          update({ pending: false, error });
          resolve(ok);
        };
        finishPending = finish;
        try {
          tt.navigateToScene({
            scene: 'sidebar',
            success: result => finish(!(result && result.code === 1), result && result.code === 1 ? 'Navigation cancelled' : null),
            fail: result => finish(false, result && result.errMsg || 'Sidebar navigation failed')
          });
        } catch (_error) { finish(false, 'Sidebar navigation failed'); }
      });
    },
    destroy() {
      if (destroyed) return;
      if (finishPending) finishPending(false, 'Sidebar adapter destroyed');
      destroyed = true;
      if (typeof tt.offShow === 'function') tt.offShow(onShow);
      listeners.clear();
    }
  };
}
