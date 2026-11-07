// Google Cloud Pub/Sub push endpoint for Real-time Developer Notifications.
// Handles purchased / renewed / canceled / grace / on hold / recovered / revoked / expired by re-verifying the token.
// Deploy with --no-verify-jwt (Pub/Sub does not send a Supabase JWT) and protect with ?secret=<RTDN_SECRET>.
import { admin, applyVerified, verifyWithGoogle } from '../_shared/play.ts';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get('secret') !== Deno.env.get('RTDN_SECRET')) return new Response('forbidden', { status: 403 });
  try {
    const body = await req.json();
    const msg = JSON.parse(atob(body.message.data));
    const n = msg.subscriptionNotification;
    if (!n) return new Response('ignored', { status: 200 }); // test or one-time-product notifications
    const db = admin();
    const { data: sub } = await db.from('subscriptions').select('workspace_id').eq('purchase_token', n.purchaseToken).maybeSingle();
    if (!sub) return new Response('unknown token', { status: 200 }); // verify-purchase has not run yet; the app will verify it
    const v = await verifyWithGoogle(n.purchaseToken);
    await applyVerified(sub.workspace_id, n.purchaseToken, v);
    return new Response('ok', { status: 200 });
  } catch (e) {
    return new Response(String(e), { status: 500 }); // non-2xx makes Pub/Sub retry
  }
});
