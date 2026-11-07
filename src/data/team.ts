import { supabase } from '../cloud';
import { getWorkspace } from '../db/repo';
import { adoptCloudWorkspace, syncNow } from '../sync/sync';
import { wipeLocalData } from './account';
import { refreshMembership } from './membership';

/**
 * Teams (Business): the owner makes a 6-digit code; an operator/driver signs in on their own phone and joins.
 * Members log work on the resources they use; amounts can be hidden from them.
 */
export { amountsHidden, isOperator, membership } from './membership';

export async function createInvite(role: 'member' | 'manager', seeAmounts: boolean): Promise<{ ok: true; code: string } | { ok: false; message: string }> {
  const ws = getWorkspace();
  const { data: s } = await supabase.auth.getSession();
  if (!ws || !s.session) return { ok: false, message: 'Sign in first (More → Sign in to back up), so your team can reach the business online.' };
  await syncNow();
  const { data, error } = await supabase.rpc('create_invite', { ws: ws.id, member_role: role, see_amounts: seeAmounts });
  if (error || !data) return { ok: false, message: error?.message ?? 'Could not make a code. Check the internet and try again.' };
  return { ok: true, code: String(data) };
}

export interface Member { userId: string; email: string; role: string; canSeeAmounts: boolean }
export async function listMembers(): Promise<Member[]> {
  const ws = getWorkspace();
  if (!ws) return [];
  const { data, error } = await supabase.rpc('list_members', { ws: ws.id });
  if (error || !data) return [];
  return (data as any[]).map((m) => ({ userId: m.user_id, email: m.email, role: m.role, canSeeAmounts: m.can_see_amounts }));
}

/** Operator side: join with a code. Replaces any business on this phone with the owner's one. */
export async function joinWithCode(code: string): Promise<{ ok: boolean; message?: string }> {
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return { ok: false, message: 'Sign in first, then enter the code.' };
  const { data, error } = await supabase.rpc('join_with_code', { c: code.trim() });
  if (error || !data) {
    const m = error?.message ?? '';
    return { ok: false, message: m.includes('BAD_CODE') ? 'That code is wrong or has expired. Ask the owner for a new one.' : m || 'Could not join.' };
  }
  const wsId = String(data);
  if (getWorkspace()?.id !== wsId) {
    wipeLocalData();
    // adopt the owner's business: exactly the one we just joined
    if (!(await adoptCloudWorkspace(wsId))) return { ok: false, message: 'Joined, but the business could not be loaded. Try again in a minute.' };
  }
  await refreshMembership(wsId);
  await syncNow();
  return { ok: true };
}
