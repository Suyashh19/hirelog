# How each profession is really billed — edge cases

## Flexible model (2026-11-05)
Every price has two settings, and the app follows them everywhere (Home button, Stop screen, Add work, bills):
- **Charged by:** hour · km · day · job · trip · acre · piece · session · shift
- **Measured by:** timer · GPS on this phone · km on the dashboard · machine's hours counter · type the number

Setup asks "How do you charge?" with plain examples per business type (trades / machine / vehicle / freelancer),
so nothing assumes hours. GPS: in Expo Go it counts only while the app is open; the installed app counts with the
screen off (foreground service notification). The GPS km is pre-filled at Stop and can be corrected.

Status: ✅ built · 🔧 built in this round · ⏳ later

## The core question: what decides the amount?

| Charged by | Timer needed? | What the app must capture | Example |
|---|---|---|---|
| Hour (clock) | **Yes** | start, stop, breaks | electrician labour, freelancer |
| Hour (machine meter) | Clock is backup only | hour-meter start/end reading | JCB, crane, generator |
| Km | **No** — distance matters | odometer start/end reading | cab, tempo, rented car with driver |
| Day | Only to count days | out date/time, return date/time → days | self-drive car, generator, scaffolding |
| Shift | Optional | number of shifts | operator, helper |
| Trip / acre / piece / session | **No** | a count | tractor per acre, tanker per trip |
| Fixed job | **No** | the job and its price | fan installation ₹300, website ₹40,000 |

Rule built in this round 🔧: the Home Start button follows the rate's unit:
- hour / shift / day → **timer** (day turns elapsed time into days when you stop)
- km → **Start trip** asks for the odometer, **Stop** asks for the end reading → km = end − start
- job / piece / trip / acre / session → **no timer**: "Log a job" opens a count entry

---

## 1. Trades & home services (electrician, plumber, carpenter, AC repair, painter)

| Edge case | Status |
|---|---|
| Hourly labour with minimum time and rounding | ✅ |
| Visit charge on every job | ✅ |
| **Inspection / visit only, no work done → still charge the visit** (was ₹0) | 🔧 |
| Fixed-price jobs ("fan installation ₹300") without a timer | 🔧 (job unit → "Log a job") |
| Several materials per job, qty × price, decimal qty (2.5 m wire) | ✅ |
| Customer supplied the material → nothing to bill | ✅ (just don't add it) |
| Night / Sunday emergency rate | ✅ |
| Multi-day job at one site | ✅ (sites; one entry per day) |
| Helper charged per day | ✅ (second resource, unit day) |
| Free return visit under warranty | ✅ (₹0 rate variant "Warranty") |
| Advance taken for materials | ✅ (payment before bill = credit) |
| Estimate / quotation before work | ⏳ |
| Job photos (before/after) | ⏳ (Business, Phase 3) |

## 2. Equipment & vehicle rental (JCB, excavator, tractor, crane, generator, car, tempo)

| Edge case | Status |
|---|---|
| Hour-meter billing with start/end readings | ✅ |
| Meter vs clock mismatch warning | ✅ |
| **Minimum hours per day** (e.g. 8 h minimum) | ✅ (minimum billable time) |
| **Per-km billing from odometer readings** (cab, tempo) | 🔧 |
| **Minimum km per day / minimum days** | 🔧 (minimum quantity on any count rate) |
| **Per-day rental (self-drive car, generator)** — days from out/return time, editable | 🔧 |
| Tractor per acre / tanker per trip — count, no timer | 🔧 |
| Transport / shifting charge (mobilisation), one time | ✅ (extra charge line) |
| Operator allowance (bata) per day, night halt | ✅ (extra charge line) |
| Tolls, parking, permit | ✅ (extra charge line) |
| Diesel supplied by owner and charged | ✅ (extra charge line) |
| Diesel supplied by customer → deduct | ⏳ (negative line) |
| Breakdown time not billed | ✅ (Break button) |
| Night work rate | ✅ |
| Self-drive car: day rate + km limit + extra km | ⏳ (two-part rate) |
| Security deposit taken and returned | ⏳ |
| Fuel level out/in | ⏳ |

## 3. Freelancers & consultants (developer, designer, CA, lawyer)

| Edge case | Status |
|---|---|
| Hourly with timer, breaks, rounding | ✅ |
| Projects under a client | ✅ (sites = projects) |
| Fixed-price project / milestone, no timer | 🔧 (job unit → "Log a job") |
| Reimbursable expenses (travel, software) | ✅ (extra charge lines) |
| GST tax invoice, CGST/SGST vs IGST | ✅ |
| Not GST-registered → plain bill | ✅ |
| Invoice prefix, due date | ✅ |
| **TDS deducted by the client (10% under 194J)** | ⏳ |
| Monthly retainer (fixed fee every month) | ⏳ |
| Foreign client, USD, export without GST (LUT) | ⏳ |
| Non-billable internal time | ⏳ |
| 6-minute (0.1 h) rounding | ⏳ |
