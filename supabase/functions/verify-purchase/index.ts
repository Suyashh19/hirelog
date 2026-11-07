// Called by the app after a purchase, upgrade or restore. Verifies the token with Google Play,
// acknowledges it (Google refunds unacknowledged purchases after 3 days), and grants the entitlement.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { acknowledge, applyVerified, verifyWithGoogle } from '../_shared/play.ts';

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false }, 405);
  try {
    // Identify the caller from their own JWT, then check they manage the workspace they are paying for.
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ ok: false, error: 'unauthenticated' }, 401);
    const { workspaceId, purchaseToken } = await req.json();
    const { data: ok } = await userClient.rpc('is_manager', { ws: workspaceId });
    if (!ok) return json({ ok: false, error: 'not a manager' }, 403);

    const v = await verifyWithGoogle(purchaseToken);
    if (!['pro', 'business'].includes(v.productId)) return json({ ok: false, error: 'unknown product' }, 400);
    await applyVerified(workspaceId, purchaseToken, v);
    if (!v.acknowledged) await acknowledge(v.productId, purchaseToken);
    return json({ ok: true, plan: v.productId, state: v.state, expiresAt: v.expiresAt });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
