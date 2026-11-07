# Steps only the owner can do

Code for these is already written. Each step needs an account or a secret that belongs to you.

## 1. Google Play billing (subscriptions)

1. **Payments profile.** Play Console → Setup → Payments profile. Add bank account, PAN and address. Verification takes days, so start first.
2. **Development build with billing.** `eas build --profile development --platform android` (or `npx expo run:android`). Expo Go cannot test purchases.
3. **Upload to internal testing.** Play Console only lets you create subscriptions after it has seen the billing library in an uploaded build.
4. **Create the products** (Monetize → Subscriptions):

   | Product ID | Base plan ID | Period | Price (India) |
   |---|---|---|---|
   | `pro` | `monthly` | 1 month | ₹149 |
   | `pro` | `sixmonth` | 6 months | ₹699 |
   | `pro` | `yearly` | 1 year | ₹999 |
   | `business` | `monthly` | 1 month | ₹399 |
   | `business` | `sixmonth` | 6 months | ₹1,899 |
   | `business` | `yearly` | 1 year | ₹2,999 |

   Turn on auto-renew, a 7-day grace period and account hold.
5. **Service account.** Google Cloud → IAM → Service accounts → create one, download the JSON key. In Play Console → Users and permissions, invite its email with financial access.
6. **Pub/Sub.** Create a topic, give `google-play-developer-notifications@system.gserviceaccount.com` the Publisher role on it, add a **push** subscription to the `play-rtdn` URL (below), then enable Real-time developer notifications in Play Console → Monetization setup. Set a ₹100 budget alert on the Cloud project.
7. **License testers.** Play Console → Settings → License testing: add the Google accounts that will test, so purchases are free.

## 2. Deploy the two Edge Functions

```bash
npm i -g supabase            # or: npx supabase ...
supabase login
supabase link --project-ref vqxbrfafkiukvxzosgoq

supabase secrets set PLAY_SERVICE_ACCOUNT="$(cat service-account.json)"
supabase secrets set PLAY_PACKAGE_NAME=com.hourlytracker.app
supabase secrets set RTDN_SECRET=<a-long-random-string>

supabase functions deploy verify-purchase
supabase functions deploy play-rtdn --no-verify-jwt
```

The Pub/Sub push endpoint is
`https://vqxbrfafkiukvxzosgoq.supabase.co/functions/v1/play-rtdn?secret=<RTDN_SECRET>`.

Never put the service account JSON or the Supabase `service_role` key inside the app.

## 3. Google one-tap sign-in (optional; email and password already work)

1. Google Cloud Console → APIs & Services → OAuth consent screen (External).
2. Credentials → OAuth client ID → **Web application**, redirect URI `https://vqxbrfafkiukvxzosgoq.supabase.co/auth/v1/callback`. Copy the client ID and secret into Supabase → Authentication → Providers → Google.
3. Credentials → OAuth client ID → **Android**, package `com.hourlytracker.app`, with the SHA-1 of your signing key (from `eas credentials` or the Play Console app-signing page).

## 4. Before real users arrive

- Set up a real email sender (Resend, Brevo, etc.) in Supabase → Authentication → Emails → SMTP. The built-in sender allows 2 emails per hour.
- Turn **Confirm email** back on once emails are reliable.
- Replace the `localhost:3000` Site URL (Authentication → URL Configuration) with a real page.
- Change any password that was ever pasted into a chat.
