import { describe, it, expect } from 'vitest';
import { isBootstrapLoadError } from './useAppBootstrap';

describe('isBootstrapLoadError', () => {
  it('is true when the first load failed and there is no bundle', () => {
    expect(isBootstrapLoadError(new Error('network'), null)).toBe(true);
  });

  it('is false while a previous bundle is still on screen (reload failed)', () => {
    expect(isBootstrapLoadError(new Error('network'), { kind: 'ready' })).toBe(false);
  });

  it('is false with no error', () => {
    expect(isBootstrapLoadError(null, null)).toBe(false);
  });
});
