import { describe, expect, it } from 'vitest';
import { toLocal, toRemote } from './convert';

describe('sync conversions', () => {
  it('local -> remote: ms to ISO, int to boolean, JSON text to object, drops updated_at', () => {
    const r = toRemote({
      id: 'a', workspace_id: 'w', started_at: Date.UTC(2026, 10, 3, 4, 30), ended_at: null, tamper_flag: 1,
      rate_snapshot: '{"amountPaise":30000}', updated_at: 123, resource_id: 'r',
    }, 'user-1');
    expect(r.started_at).toBe('2026-11-03T04:30:00.000Z');
    expect(r.ended_at).toBeNull();
    expect(r.tamper_flag).toBe(true);
    expect(r.rate_snapshot).toEqual({ amountPaise: 30000 });
    expect('updated_at' in r).toBe(false);
    expect(r.member_id).toBe('user-1');
  });
  it('only time entries get member_id', () => {
    expect('member_id' in toRemote({ id: 'c', workspace_id: 'w', name: 'Asha' }, 'u')).toBe(false);
  });
  it('remote -> local: ISO to ms, boolean to int, jsonb to text, ignores unknown columns', () => {
    const cols = new Set(['id', 'started_at', 'tamper_flag', 'rate_snapshot', 'deleted_at']);
    const l = toLocal({
      id: 'a', started_at: '2026-11-03T04:30:00.000Z', tamper_flag: false, rate_snapshot: { x: 1 },
      deleted_at: null, server_started_at: '2026-11-03T04:30:01Z',
    }, cols);
    expect(l).toEqual({ id: 'a', started_at: Date.UTC(2026, 10, 3, 4, 30), tamper_flag: 0, rate_snapshot: '{"x":1}', deleted_at: null });
  });
  it('round trip keeps the timestamp', () => {
    const ms = 1_800_000_000_123;
    const back = toLocal(toRemote({ id: 'x', started_at: ms, resource_id: 'r' }), new Set(['started_at']));
    expect(back.started_at).toBe(ms);
  });
});
