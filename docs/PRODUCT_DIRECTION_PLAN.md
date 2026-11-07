# Product direction plan — for approval

Date: 2026-11-05 · Status: **proposal, no code until approved**

## 1. The one-line direction

**"Proof-of-work billing for people who rent out machines, vehicles and their own time."**
Measure the work (hours counter, GPS km, timer, acres), get the customer to confirm it on their phone,
and get paid from the bill — in India and abroad.

Why this and not "another invoice app": free tools already win plain invoicing (Khatabook, Zoho Invoice,
Clockify). Nobody small does *measure → customer confirms → bill → paid* in one cheap app. Disputes about hours
and km are real (signed time sheets decide who wins), and the job value is high (JCB ₹700–1,200/h, US/UK
equipment much more), so ₹149 or $10 a month is easy to justify.

## 2. Research summary (sources at the end)

| Finding | What it means for us |
|---|---|
| JCB rental in India ₹700–1,200/h; monthly hires with hour caps + extra-hour rate; late payment "the norm"; advances advised | Hour caps, extra-hour rate, advances and reminders are core. Proof of hours matters. |
| Signed time sheets decide disputes; unsigned logs favour whoever kept them | **Customer confirmation** is the strongest paid feature. |
| Cab/tempo: per-km with 250–300 km/day minimum, driver bata ₹300–400/day, night allowance, tolls at actuals; duty slip = odometer + times + customer sign-off | Already built: per-km, minimum km. Need: bata/night allowance presets, duty slip with sign-off. |
| India competitors: Khatabook free; Vyapar/myBillBook ~₹1,000–3,500/year; JCB LiveLink, FleetSetu, Billenix for big fleets | Small operators are under-served; stay cheaper than GPS-box fleet SaaS (₹300–600/vehicle/month). |
| Abroad: Jobber/Tradify/ServiceM8 $29–60/month; Toggl/Harvest $9–18/user; MileIQ/Everlance $8–14; rental software $29–99; UK ag contractor apps (Ag-Drive etc.) | Foreign users pay **5–20× more**. Equipment owner-operators and ag contractors are the best fit abroad. |
| MSME surveys: 52–56% prefer English, Hindi ~21%, women more local-language; cost is a top barrier | Hindi/Marathi helps a large minority (rural tractor/JCB owners most). Keep Free useful. |

## 3. Synthetic simulation of 1,000 owners (NOT real data)

Seeded model (`simulate_owners.py`): 600 in India, 400 abroad, 10 segments. Importances and willingness to pay
are my assumptions anchored on the prices above; competitor strength lowers conversion. Use it for **ranking**, not forecasts.

| Segment | Today: pay | After roadmap: pay | Note |
|---|---|---|---|
| IN JCB / excavator owners | 6.7% | 27.5% | best India segment |
| IN tractor owners | 0.8% | 17.5% | blocked today by language + no acre measuring |
| IN cab / tempo owners | 1.7% | 20.0% | needs duty slip + sign-off |
| IN trades | 2.9% | 10.7% | strong free competition |
| IN freelancers | 4.0% | 17.0% | needs TDS |
| INTL trades | 3.3% | 20.8% | Jobber/Tradify are strong, but expensive |
| INTL freelancers | 0.0% | 10.8% | crowded, low WTP — not a focus |
| INTL ag contractors | 3.3% | 23.3% | high value |
| INTL equipment owner-operators | 6.7% | **35.0%** | **best segment overall** |
| INTL drivers (mileage) | 0.0% | 5.0% | MileIQ wins; drop |
| **Total** | **2.9% ≈ $183/mo** | **18.5% ≈ $1,218/mo** | per 1,000 owners |

(The "after" numbers are optimistic: the model assumes each feature is built well and found. The ranking is the signal.)

**Most valuable missing features (money-weighted):**
1. Multi-currency + VAT/sales tax (abroad)
2. Accounting export (Xero / QuickBooks / Tally)
3. **Customer confirms hours/km on their phone**
4. Operator/driver logs on their own phone, owner sees
5. Photos on jobs
6. Diesel/fuel + expenses → profit per machine/vehicle
7. Quotes/estimates → job
8. Pay link on the bill (UPI in India, card/Stripe abroad)
9. Automatic payment reminders
10. Measure field acres with GPS (tractors)

## 4. Who we build for (in order)

1. **Machine owners** — JCB/excavator/crane (India), equipment owner-operators (US/UK/AU)
2. **Agricultural contractors / tractor owners** — India (per acre/hour) and UK/IE/NZ/AU
3. **Vehicle owners** — cab/tempo/tour operators (India), small hire firms abroad
4. Keep, but do not chase: **trades** and **freelancers** (they work today; add only cheap wins like quotes, TDS)
5. Drop for now: pure mileage drivers (MileIQ owns it)

## 5. Roadmap (each phase ends with a phone-tested build)

**Phase A — Ready for the world (≈ 2 weeks)**
- Phone-test everything built so far; fix bugs; finish purchases test and Google sign-in.
- **Region setup**: country → currency, tax name (GST / VAT / sales tax), date format, km or miles.
- **Languages**: English first, then Hindi and Marathi (framework so more can be added).
- Rename the app (it is no longer "hourly"): suggestion **MeterOn** (already in the PRD footer) — your call.

**Phase B — Proof (the reason to pay) (≈ 3 weeks)**
- **Customer confirmation**: after Stop, send a link on WhatsApp/SMS; customer taps *Confirm* or *Dispute*; bill shows "Confirmed by customer at 6:40 pm".
- **Photos** on a job (hours counter, site, before/after) — attached to the entry and the bill link.
- **GPS trip summary** on the bill (km, start/end place, time).
- **Duty slip** for vehicles: km, times, tolls, bata, night allowance, customer sign-off.

**Phase C — Get paid faster (≈ 2 weeks)**
- Pay link on every bill: UPI (India), Stripe/PayPal payment link (abroad).
- **Automatic reminders** (3 / 7 / 15 days, polite, user approves once).
- Advances and **monthly hire with hour cap + extra-hour rate** (JCB contracts).
- **Quotes** that turn into jobs.

**Phase D — Money insight (≈ 2 weeks)**
- Diesel/fuel and expenses per machine/vehicle → **profit per machine** (Business).
- Export for **Tally / Xero / QuickBooks** (CSV formats).
- TDS on invoices (India freelancers/companies).

**Phase E — Teams and fields (≈ 3 weeks)**
- **Operator app**: operator/driver logs on their own phone (Business, already planned as Phase 3 team).
- **Measure field acres** by walking/driving the boundary (tractors).

## 6. Pricing

| | India | Abroad (Google Play regional prices) |
|---|---|---|
| Free | 1 machine/vehicle/service, 5 customers, 10 PDF bills | same |
| Pro | ₹149 / month (yearly ₹999) | **$9.99 / month** (yearly $79) |
| Business | ₹399 / month (yearly ₹2,999) | **$24.99 / month** (yearly $199) |

Customer confirmation and pay links go in **Pro** (they sell the plan); team, photos, profit, exports in **Business**.
Google keeps 15% of subscriptions.

## 7. How we will know it works

- 20 real interviews before Phase B: 10 machine owners (5 India, 5 abroad), 5 tractor/ag contractors, 5 vehicle owners. Show the app, ask "would you pay ₹149 / $10 a month?" and what is missing.
- After launch: activation = first bill sent within 7 days (target 40%); trial→paid (target 5% India, 8% abroad); % of entries confirmed by customers.

## 8. Risks

- Customer confirmation needs a small web page (Supabase + GitHub Pages) — some setup on your side.
- Background GPS and photos need Play Console declarations (location, camera).
- Multi-currency/tax abroad must be correct per country — start with UK (VAT), US (sales tax off by default), Australia/NZ (GST), Canada later.
- The simulation is synthetic; interviews must confirm or change the order.

## Sources
- JCB rates and terms: indiamart.com (JCB rental ₹900/h), driviotrucks.com (JCB earnings 2026), desimachines.com (buy vs rent; rate card), tradeindia.com (JCB 3DX monthly with hour cap)
- Logbook/time-sheet disputes: aiimsdeoghar.edu.in JCB hiring notice; rieter.com service conditions (signed time sheets); ibbi.gov.in order (inflated hours)
- India fleet/rental tools: jcblivelink.com, fleetsetu.com, billenix.com, navionyx.com, sitesetu.app (Fleetx pricing)
- Cab/tempo billing: chikucab.com, cabbazar.com, easytripsheet.com, fleetup.in, cabbill.in
- India billing apps: techjockey.com comparisons, vanijbill.com pricing, softwaresuggest.com
- Freelancer invoicing: refrens.com, riffit.in, appadvisor.in (Zoho Invoice)
- MSME digital adoption: businessworld.in (PayNearby index), ris.org.in, sidbi.in, indiasmeforum.org
- Abroad: fieldservicepicker / listicler / whito.co.uk (Jobber, Tradify, ServiceM8); fwi.co.uk, profi.co.uk, apps.xero.com (Ag-Drive and UK contractor apps); capterra / pricingsaas (MileIQ, Everlance, rental software); kimai.org / costbench (Toggl, Harvest, Clockify)
