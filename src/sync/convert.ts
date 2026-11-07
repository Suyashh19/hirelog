/** Pure row conversions between local SQLite (epoch ms, 0/1, JSON text) and Supabase (ISO strings, booleans, jsonb). */
type Row = Record<string, any>;

export const TS = new Set(['updated_at', 'deleted_at', 'started_at', 'ended_at', 'period_from', 'period_to', 'sent_at', 'received_at', 'due_at',
  'confirmed_at', 'valid_until', 'spent_at']);
export const BOOL = new Set(['is_active', 'tamper_flag', 'igst']);
export const JSONC = new Set(['rate_snapshot', 'lines']);

export function toRemote(p: Row, userId?: string): Row {
  const o: Row = {};
  for (const [k, v] of Object.entries(p)) {
    if (k === 'updated_at') continue; // server-authoritative
    if (v === null || v === undefined) o[k] = null;
    else if (TS.has(k)) o[k] = new Date(v).toISOString();
    else if (BOOL.has(k)) o[k] = !!v;
    else if (JSONC.has(k)) o[k] = typeof v === 'string' ? JSON.parse(v) : v;
    else o[k] = v;
  }
  if (userId && 'started_at' in p && 'resource_id' in p) o.member_id = userId; // time_entries only
  return o;
}

export function toLocal(r: Row, cols: Set<string>): Row {
  const o: Row = {};
  for (const [k, v] of Object.entries(r)) {
    if (!cols.has(k)) continue;
    if (v === null || v === undefined) o[k] = null;
    else if (TS.has(k)) o[k] = Date.parse(v);
    else if (BOOL.has(k)) o[k] = v ? 1 : 0;
    else if (JSONC.has(k)) o[k] = typeof v === 'string' ? v : JSON.stringify(v);
    else o[k] = v;
  }
  return o;
}
