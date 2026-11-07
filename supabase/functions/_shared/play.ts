// Shared helpers for Google Play verification. Secrets (set with `supabase secrets set`):
//   PLAY_SERVICE_ACCOUNT  - the service account JSON key (financial access in Play Console)
//   PLAY_PACKAGE_NAME     - e.g. com.hourlytracker.app
import { createClient } from 'jsr:@supabase/supabase-js@2';

export const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
export const PACKAGE = () => Deno.env.get('PLAY_PACKAGE_NAME') ?? 'com.hourlytracker.app';

const b64url = (b: ArrayBuffer | string) => {
  const bytes = typeof b === 'string' ? new TextEncoder().encode(b) : new Uint8Array(b);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function accessToken(): Promise<string> {
  const sa = JSON.parse(Deno.env.get('PLAY_SERVICE_ACCOUNT')!);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claim}`));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claim}.${b64url(sig)}` }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('google auth failed');
  return j.access_token;
}

export interface Verified { productId: string; basePlanId: string; state: string; expiresAt: string; autoRenewing: boolean; acknowledged: boolean }

const STATE: Record<string, string> = {
  SUBSCRIPTION_STATE_ACTIVE: 'active', SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'grace', SUBSCRIPTION_STATE_ON_HOLD: 'on_hold',
  SUBSCRIPTION_STATE_PAUSED: 'on_hold', SUBSCRIPTION_STATE_CANCELED: 'canceled', SUBSCRIPTION_STATE_EXPIRED: 'expired',
};

export async function verifyWithGoogle(token: string): Promise<Verified> {
  const at = await accessToken();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE()}/purchases/subscriptionsv2/tokens/${token}`;
  const r = await fetch(url, { headers: { authorization: `Bearer ${at}` } });
  if (!r.ok) throw new Error(`play ${r.status}`);
  const j = await r.json();
  const line = j.lineItems?.[0] ?? {};
  return {
    productId: line.productId, basePlanId: line.offerDetails?.basePlanId ?? 'monthly',
    state: STATE[j.subscriptionState] ?? 'expired', expiresAt: line.expiryTime,
    autoRenewing: !!line.autoRenewingPlan?.autoRenewEnabled, acknowledged: j.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
  };
}

export async function acknowledge(productId: string, token: string) {
  const at = await accessToken();
  await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE()}/purchases/subscriptions/${productId}/tokens/${token}:acknowledge`, {
    method: 'POST', headers: { authorization: `Bearer ${at}`, 'content-type': 'application/json' }, body: '{}',
  });
}

/** Writes the subscription row and the workspace entitlement. Access continues through grace, canceled-until-expiry. */
export async function applyVerified(workspaceId: string, token: string, v: Verified) {
  const db = admin();
  const { error } = await db.from('subscriptions').upsert({
    workspace_id: workspaceId, product_id: v.productId, base_plan_id: v.basePlanId, purchase_token: token,
    state: v.state, expires_at: v.expiresAt, auto_renewing: v.autoRenewing, last_verified_at: new Date().toISOString(),
  }, { onConflict: 'purchase_token' });
  if (error) throw error;
  const grants = ['active', 'grace', 'canceled'].includes(v.state) && new Date(v.expiresAt) > new Date();
  const e = await db.from('entitlements').upsert({
    workspace_id: workspaceId, plan: grants ? v.productId : 'free', source: 'play', expires_at: v.expiresAt, updated_at: new Date().toISOString(),
  }, { onConflict: 'workspace_id,source' });
  if (e.error) throw e.error;
}
