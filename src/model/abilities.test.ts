import { describe, expect, it } from 'vitest';
import { meets, parseReq, ReqError } from './abilities';

const have = (caps: string[], counts: Record<string, number> = {}) => ({ caps: new Set(caps), counts });

describe('requirements', () => {
  it('treats empty as always met', () => expect(meets('', have([]))).toBe(true));
  it('checks one capability', () => {
    expect(meets('missile', have(['missile']))).toBe(true);
    expect(meets('missile', have(['bomb']))).toBe(false);
  });
  it('binds & tighter than |', () => {
    expect(meets('roll & bomb | nova', have(['nova']))).toBe(true);
    expect(meets('roll & (bomb | nova)', have(['nova']))).toBe(false);
    expect(meets('roll & (bomb | nova)', have(['roll', 'nova']))).toBe(true);
  });
  it('compares ammo counts', () => {
    expect(meets('missiles>=10', have([], { missiles: 10 }))).toBe(true);
    expect(meets('missiles >= 10', have([], { missiles: 5 }))).toBe(false);
  });
  it('rejects malformed input', () => {
    expect(() => parseReq('a &')).toThrow(ReqError);
    expect(() => parseReq('(a')).toThrow(ReqError);
    expect(() => parseReq('a b')).toThrow(ReqError);
    expect(meets('a &', have(['a']))).toBe(false);
  });
});
