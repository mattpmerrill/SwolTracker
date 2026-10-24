/**
 * Minimal hook runner for the Node test environment (no DOM, no renderer
 * package). It implements just the React hooks our hooks use, so a test can
 * mock 'react' with `fakeReact` and drive a hook through renders, effects,
 * updates and unmount.
 *
 *   vi.mock('react', async () => (await import('../test/hookHarness.js')).fakeReact);
 */

let active = null;

function depsChanged(prev, next) {
  if (!prev || !next) return true;
  if (prev.length !== next.length) return true;
  return next.some((dep, i) => !Object.is(dep, prev[i]));
}

function slot() {
  const h = active;
  if (!h) throw new Error('Hook called outside renderHook');
  const i = h.cursor++;
  if (!h.slots[i]) h.slots[i] = {};
  return h.slots[i];
}

export const fakeReact = {
  useState(initial) {
    const h = active;
    const s = slot();
    if (!('value' in s)) {
      s.value = typeof initial === 'function' ? initial() : initial;
      s.set = (update) => {
        const next = typeof update === 'function' ? update(s.value) : update;
        if (Object.is(next, s.value)) return;
        s.value = next;
        if (h.rendering) h.renderPhaseUpdate = true;
        else h.render();
      };
    }
    return [s.value, s.set];
  },
  useRef(initial) {
    const s = slot();
    if (!s.ref) s.ref = { current: initial };
    return s.ref;
  },
  useMemo(fn, deps) {
    const s = slot();
    if (!('value' in s) || depsChanged(s.deps, deps)) {
      s.value = fn();
      s.deps = deps;
    }
    return s.value;
  },
  useCallback(fn, deps) {
    return fakeReact.useMemo(() => fn, deps);
  },
  useEffect(fn, deps) {
    const h = active;
    const s = slot();
    if (!s.ran || depsChanged(s.deps, deps)) {
      h.pendingEffects.push(s);
      s.next = fn;
      s.deps = deps;
      s.ran = true;
    }
  },
};

/**
 * Renders `hookFn(props)` and keeps it live. `result.current` is the latest
 * return value. State updates re-render synchronously, like a flushed act().
 */
export function renderHook(hookFn, initialProps) {
  const h = {
    slots: [],
    cursor: 0,
    rendering: false,
    renderPhaseUpdate: false,
    pendingEffects: [],
    props: initialProps,
    unmounted: false,
  };
  const result = { current: undefined };

  h.render = () => {
    if (h.unmounted) return;
    const previous = active;
    active = h;
    try {
      let guard = 0;
      do {
        h.renderPhaseUpdate = false;
        h.cursor = 0;
        h.pendingEffects = [];
        h.rendering = true;
        result.current = hookFn(h.props);
        h.rendering = false;
        if (++guard > 50) throw new Error('Too many re-renders');
      } while (h.renderPhaseUpdate);
    } finally {
      h.rendering = false;
      active = previous;
    }
    const effects = h.pendingEffects;
    h.pendingEffects = [];
    effects.forEach((s) => { s.cleanup?.(); s.cleanup = undefined; });
    effects.forEach((s) => {
      const previousActive = active;
      active = null;
      try {
        s.cleanup = s.next() || undefined;
      } finally {
        active = previousActive;
      }
    });
  };

  h.render();

  return {
    result,
    rerender(nextProps) {
      if (nextProps !== undefined) h.props = nextProps;
      h.render();
    },
    unmount() {
      h.unmounted = true;
      h.slots.forEach((s) => { s.cleanup?.(); s.cleanup = undefined; });
    },
  };
}
