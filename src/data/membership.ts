import { supabase } from '../cloud';
import { bump, kvGet, kvSet } from '../db/repo';

/** What the signed-in person may do in this business (from the server; owner by default when working alone). */
export interface Membership { role: 'owner' | 'manager' | 'member'; canSeeAmounts: boolean }

export function membership(): Membership {
  try {
    const raw = kvGet('membership');
    return raw ? (JSON.parse(raw) as Membership) : { role: 'owner', canSeeAmounts: true };
  } catch {
    return { role: 'owner', canSeeAmounts: true };
  }
}
/** True for an operator/driver on someone else's business: no bills, prices or customers to edit. */
export const isOperator = () => membership().role === 'member';
export const amountsHidden = () => isOperator() && !membership().canSeeAmounts;

export async function refreshMembership(wsId: string) {
  const { data, error } = await supabase.rpc('my_membership', { ws: wsId });
  if (error || !data) return;
  const m: Membership = { role: data.role, canSeeAmounts: !!data.can_see_amounts };
  if (JSON.stringify(m) !== kvGet('membership')) { kvSet('membership', JSON.stringify(m)); bump(); }
  const { data: s } = await supabase.auth.getSession();
  const who = s.session?.user.email?.split('@')[0] ?? null;
  if (who && kvGet('member-name') !== who) kvSet('member-name', who);
}
