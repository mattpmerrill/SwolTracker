import { describe, it, expect } from 'vitest';
import { applyWeightCascade } from './weightOverrides';

const noneLogged = () => false;

describe('applyWeightCascade', () => {
  it('applies the override to the edited set and every later set', () => {
    const result = applyWeightCascade({}, 0, 170, noneLogged, 3);
    expect(result).toEqual({ 0: 170, 1: 170, 2: 170 });
  });

  it('skips already-logged later sets', () => {
    const isLogged = (i) => i === 1;
    const result = applyWeightCascade({}, 0, 170, isLogged, 3);
    expect(result).toEqual({ 0: 170, 2: 170 });
    expect(result[1]).toBeUndefined();
  });

  it('editing a later set only cascades forward, not backward', () => {
    const result = applyWeightCascade({ 0: 170, 1: 170, 2: 170 }, 1, 160, noneLogged, 3);
    expect(result).toEqual({ 0: 170, 1: 160, 2: 160 });
  });

  it('still sets the edited set even if that set is itself logged (user is re-editing)', () => {
    const isLogged = (i) => i === 0;
    const result = applyWeightCascade({}, 0, 170, isLogged, 3);
    expect(result[0]).toBe(170);
    expect(result[1]).toBe(170);
  });

  it('clearing an override (null) removes it and cascades the clear', () => {
    const result = applyWeightCascade({ 0: 170, 1: 170, 2: 170 }, 0, null, noneLogged, 3);
    expect(result).toEqual({});
  });

  it('clearing a later set preserves earlier overrides', () => {
    const result = applyWeightCascade({ 0: 170, 1: 170, 2: 170 }, 1, null, noneLogged, 3);
    expect(result).toEqual({ 0: 170 });
  });

  it('does nothing beyond totalSets', () => {
    const result = applyWeightCascade({}, 1, 200, noneLogged, 2);
    expect(result).toEqual({ 1: 200 });
    expect(result[2]).toBeUndefined();
  });
});
