# HireLog: what is left before production

Updated 2026-11-05. All features for phases A–E are coded. Supabase migrations 0001–0008 are applied.

## 1. Test (now)
- [ ] Test every screen in Expo Go: quotes, expenses, profit, exports, team/join, measure a field, confirmation link, photos, reminders, foreign country setup (UK / US / AU), Hindi
- [ ] Send the bugs to Claude and fix them

## 2. Build and payments
- [ ] EAS development build (needed for background GPS, trip notification and in-app purchases)
- [ ] Play Console: create the Pro / Business subscription products
- [ ] Deploy the `verify-purchase` and `play-rtdn` functions (see `docs/SETUP_PLAY_AND_DEPLOY.md`)
- [ ] Make a test purchase

## 3. Setup
- [ ] Publish `web/confirm.html` on GitHub Pages and put its address in `CONFIRM_PAGE_URL` (`src/config.ts`)
- [ ] Fix Google sign-in (paused; Supabase redirect URL for Expo Go)
- [ ] Real email sender (e.g. Resend). Supabase's built-in sender allows only 2 emails an hour
- [ ] Crash reporting (e.g. Sentry)

## 4. Play Store
- [ ] Privacy policy page
- [ ] Data safety form
- [ ] Background location and camera declarations
- [ ] Screenshots and listing: "HireLog: Invoice Maker & Hours"

## 5. Not built yet
- [ ] Photos sync between phones (they stay on the phone that took them)
- [ ] Edit approvals and audit log
- [ ] Hindi on the remaining screens
- [ ] Check the Xero and QuickBooks files with a real import

## Timeline
Test now → EAS build and payments → crash reporting and privacy policy → 14-day closed test in January 2027 → production.
