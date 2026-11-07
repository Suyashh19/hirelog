import { supabase } from '../cloud';
import { getWorkspace } from '../db/repo';
import { syncNow } from '../sync/sync';
import type { Period } from './plans';

/**
 * Google Play Billing via react-native-iap. The native module only exists in a development / production build
 * (not Expo Go), so it is loaded lazily and every call degrades to a clear message when it is missing.
 * NOTE: written against the PRD flow; it has not been exercised against Play Console yet.
 */
function iap(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-iap');
  } catch {
    return null;
  }
}
export const iapAvailable = () => iap() !== null;

export interface PurchaseResult { ok: boolean; message: string }

export async function buyPlan(product: 'pro' | 'business', period: Period): Promise<PurchaseResult> {
  const RNIap = iap();
  if (!RNIap) return { ok: false, message: 'Purchases work in the Play Store build. Expo Go cannot open Google Play billing.' };
  const ws = getWorkspace();
  if (!ws) return { ok: false, message: 'Set up your business first.' };
  const { data } = await supabase.auth.getSession();
  if (!data.session) return { ok: false, message: 'Sign in first so your plan is saved to your account.' };
  try {
    await RNIap.initConnection();
    const subs = await RNIap.fetchProducts({ skus: [product], type: 'subs' });
    const sub = subs?.find((s: any) => (s.id ?? s.productId) === product);
    const offer = sub?.subscriptionOffers?.find((o: any) => o.basePlanId === period);
    if (!offer) return { ok: false, message: 'This plan is not available in the store yet.' };
    const purchase = await RNIap.requestPurchase({
      type: 'subs',
      request: { google: { skus: [product], subscriptionOffers: [{ sku: product, offerToken: offer.offerToken }] } },
    });
    const p = Array.isArray(purchase) ? purchase[0] : purchase;
    const verified = await verifyPurchase(ws.id, product, period, p.purchaseToken);
    if (verified.ok) await RNIap.finishTransaction({ purchase: p, isConsumable: false });
    return verified;
  } catch (e: any) {
    return { ok: false, message: e?.message ?? 'Purchase cancelled.' };
  }
}

/** Server verifies with Google Play, acknowledges, and writes subscriptions + entitlements. */
export async function verifyPurchase(workspaceId: string, product: string, period: string, purchaseToken: string): Promise<PurchaseResult> {
  const { data, error } = await supabase.functions.invoke('verify-purchase', {
    body: { workspaceId, productId: product, basePlanId: period, purchaseToken },
  });
  if (error || !data?.ok) return { ok: false, message: 'We could not verify the purchase yet. It will be retried.' };
  await syncNow();
  return { ok: true, message: `You are now on ${product === 'pro' ? 'Pro' : 'Business'}.` };
}

export async function restorePurchases(): Promise<PurchaseResult> {
  const RNIap = iap();
  if (!RNIap) return { ok: false, message: 'Restore works in the Play Store build.' };
  const ws = getWorkspace();
  if (!ws) return { ok: false, message: 'Set up your business first.' };
  try {
    await RNIap.initConnection();
    const owned = await RNIap.getAvailablePurchases();
    if (!owned?.length) return { ok: false, message: 'No purchases found for this Google account.' };
    for (const p of owned) {
      const sku = p.productId ?? p.id;
      if (sku === 'pro' || sku === 'business') await verifyPurchase(ws.id, sku, 'monthly', p.purchaseToken);
    }
    return { ok: true, message: 'Purchases restored.' };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? 'Could not restore.' };
  }
}
