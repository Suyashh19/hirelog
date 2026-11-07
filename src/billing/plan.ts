import { kvGet, kvSet, bump, listResources, listCustomers, now } from '../db/repo';
import { FEATURE_MIN_PLAN, LIMITS, type Feature, type PlanId } from './plans';

export interface PlanState { plan: PlanId; source: string | null; expiresAt: number | null }

const RANK: Record<PlanId, number> = { free: 0, pro: 1, business: 2 };

/** Current plan from the last server answer. Signed-out or never-synced users are on Free. Expired grants fall back to Free. */
export function getPlan(): PlanState {
  try {
    const raw = kvGet('plan');
    if (!raw) return { plan: 'free', source: null, expiresAt: null };
    const p = JSON.parse(raw) as PlanState;
    if (p.expiresAt && p.expiresAt < now()) return { plan: 'free', source: null, expiresAt: null };
    return p;
  } catch {
    return { plan: 'free', source: null, expiresAt: null };
  }
}
export function setPlan(p: PlanState) {
  kvSet('plan', JSON.stringify(p));
  bump();
}
export const planAtLeast = (need: PlanId) => RANK[getPlan().plan] >= RANK[need];
export const hasFeature = (f: Feature) => planAtLeast(FEATURE_MIN_PLAN[f]);

export interface Blocked { trigger: string }

/** Returns null when adding is allowed, otherwise the paywall trigger. Logging time is never blocked. */
export function checkCanAdd(kind: 'resource' | 'customer'): Blocked | null {
  const { plan } = getPlan();
  const lim = LIMITS[plan];
  if (kind === 'customer') {
    if (lim.customers !== null && listCustomers().length >= lim.customers) return { trigger: 'customers' };
  } else if (lim.resources !== null && listResources().length >= lim.resources) {
    return { trigger: plan === 'pro' ? 'resources-business' : 'resources' };
  }
  return null;
}

const monthKey = () => `pdf-${new Date().toISOString().slice(0, 7)}`;
export const pdfCountThisMonth = () => parseInt(kvGet(monthKey()) ?? '0', 10);
export const bumpPdfCount = () => kvSet(monthKey(), String(pdfCountThisMonth() + 1));
export function pdfBlocked(): Blocked | null {
  const lim = LIMITS[getPlan().plan].pdfPerMonth;
  return lim !== null && pdfCountThisMonth() >= lim ? { trigger: 'pdf' } : null;
}
