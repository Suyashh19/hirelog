"""
Synthetic simulation of 1,000 business owners for the Hourly Tracker app.
NOT real data: segment sizes, feature importances and willingness-to-pay are assumptions,
anchored on public price points found in research (Nov 2026). Seeded for repeatability.
"""
import math
import random
from collections import defaultdict

random.seed(42)

FEATURES = {
    'gps_km': 'GPS counts km/trip automatically',
    'hour_counter': 'Machine hours log (start/end) per job',
    'signoff': 'Customer confirms hours/km on their phone (link/OTP)',
    'whatsapp_bill': 'Bill on WhatsApp/SMS/email in one tap',
    'pay_link': 'Pay link on the bill (UPI in India, card/Stripe abroad)',
    'reminders': 'Automatic payment reminders',
    'gst_invoice': 'GST tax invoice (India)',
    'tds': 'TDS deduction on invoices (India freelancers)',
    'local_lang': 'Hindi/Marathi/Tamil/Telugu app language',
    'intl_tax_currency': 'Multi-currency + VAT/sales tax (abroad)',
    'quotes': 'Quotes/estimates that turn into jobs',
    'schedule': 'Job calendar / bookings',
    'operator_app': 'Operator/driver logs on own phone, owner sees',
    'fuel_profit': 'Diesel/fuel + expenses, profit per machine/vehicle',
    'accounting_sync': 'Xero / QuickBooks / Tally export',
    'mileage_tax_log': 'Tax-ready mileage log (IRS/HMRC)',
    'field_area': 'Measure field acres by walking/driving the boundary',
    'photo_proof': 'Photos on jobs (before/after, site proof)',
    'retainer': 'Recurring / retainer invoices',
    'offline': 'Works fully offline',
}

# How well the app covers each feature today (0 none, 0.5 partial, 1 built) and after the proposed roadmap.
TODAY = {'gps_km': 0.6, 'hour_counter': 1, 'signoff': 0, 'whatsapp_bill': 0.8, 'pay_link': 0.6, 'reminders': 0.5,
         'gst_invoice': 1, 'tds': 0, 'local_lang': 0, 'intl_tax_currency': 0, 'quotes': 0, 'schedule': 0,
         'operator_app': 0, 'fuel_profit': 0.2, 'accounting_sync': 0.2, 'mileage_tax_log': 0, 'field_area': 0,
         'photo_proof': 0, 'retainer': 0, 'offline': 1}
ROADMAP = dict(TODAY, **{'gps_km': 1, 'signoff': 1, 'whatsapp_bill': 1, 'pay_link': 1, 'reminders': 1, 'tds': 1,
                         'local_lang': 1, 'intl_tax_currency': 1, 'quotes': 1, 'operator_app': 1, 'fuel_profit': 1,
                         'accounting_sync': 0.6, 'mileage_tax_log': 1, 'field_area': 1, 'photo_proof': 1, 'retainer': 1,
                         'schedule': 0.5})

# segment: (count, region, currency, price_pro, median monthly WTP, WTP spread, competitor strength 0..1, importances)
SEG = {
    'IN JCB / excavator owners': (120, 'IN', '₹', 149, 300, 0.7, 0.35,
        dict(hour_counter=1, signoff=0.9, whatsapp_bill=0.8, pay_link=0.7, reminders=0.9, fuel_profit=0.9, operator_app=0.8,
             local_lang=0.8, gst_invoice=0.5, offline=0.7, photo_proof=0.6)),
    'IN tractor owners (per acre/hour)': (120, 'IN', '₹', 149, 120, 0.8, 0.2,
        dict(field_area=1, hour_counter=0.6, whatsapp_bill=0.8, reminders=0.8, local_lang=1, offline=0.9, pay_link=0.6,
             fuel_profit=0.6, signoff=0.5)),
    'IN cab / tempo owners': (120, 'IN', '₹', 149, 150, 0.7, 0.45,
        dict(gps_km=1, signoff=0.8, whatsapp_bill=0.9, pay_link=0.7, gst_invoice=0.7, operator_app=0.7, fuel_profit=0.7,
             local_lang=0.6, reminders=0.6)),
    'IN trades (electrician, plumber)': (140, 'IN', '₹', 149, 80, 0.8, 0.6,
        dict(whatsapp_bill=1, pay_link=0.8, reminders=0.8, quotes=0.7, local_lang=0.8, photo_proof=0.5, offline=0.6)),
    'IN freelancers / consultants': (100, 'IN', '₹', 149, 200, 0.8, 0.7,
        dict(gst_invoice=1, tds=0.9, pay_link=0.7, reminders=0.8, intl_tax_currency=0.6, retainer=0.6, accounting_sync=0.6)),
    'INTL trades (US/UK/AU/NZ)': (120, 'INTL', '$', 9, 30, 0.6, 0.75,
        dict(quotes=1, schedule=0.9, pay_link=1, reminders=0.8, photo_proof=0.7, accounting_sync=0.9, intl_tax_currency=1,
             whatsapp_bill=0.4)),
    'INTL freelancers / consultants': (120, 'INTL', '$', 9, 10, 0.7, 0.8,
        dict(pay_link=0.9, intl_tax_currency=1, retainer=0.7, reminders=0.8, accounting_sync=0.8, quotes=0.5)),
    'INTL ag contractors (UK/IE/NZ/AU)': (60, 'INTL', '$', 19, 40, 0.6, 0.45,
        dict(field_area=1, hour_counter=0.9, gps_km=0.6, operator_app=1, accounting_sync=0.9, intl_tax_currency=1,
             fuel_profit=0.7, signoff=0.6)),
    'INTL equipment owner-operators': (60, 'INTL', '$', 19, 35, 0.6, 0.5,
        dict(hour_counter=1, signoff=0.9, pay_link=0.9, intl_tax_currency=1, accounting_sync=0.8, fuel_profit=0.7,
             photo_proof=0.7, operator_app=0.6)),
    'INTL drivers / couriers (mileage)': (40, 'INTL', '$', 9, 6, 0.6, 0.8,
        dict(gps_km=1, mileage_tax_log=1, intl_tax_currency=0.6, fuel_profit=0.6)),
}


def lognormal(median, spread):
    return median * math.exp(random.gauss(0, spread))


def simulate(cover):
    res = {}
    feature_gap = defaultdict(float)  # importance-weighted missing value, weighted by money at stake
    for name, (n, region, cur, price, wtp_med, spread, comp, imp) in SEG.items():
        paid = act = 0
        revenue = 0.0
        for _ in range(n):
            # each owner weighs features a little differently
            w = {f: max(0.0, v + random.gauss(0, 0.15)) for f, v in imp.items()}
            tot = sum(w.values()) or 1
            fit = sum(w[f] * cover.get(f, 0) for f in w) / tot          # 0..1 how well the app fits them
            wtp = lognormal(wtp_med, spread)
            # tries it seriously (activation) if the fit is decent and language is not a blocker
            lang_block = region == 'IN' and w.get('local_lang', 0) > 0.7 and cover['local_lang'] < 1
            p_act = max(0.0, min(1.0, 0.25 + 0.75 * fit - (0.25 if lang_block else 0)))
            if random.random() > p_act:
                continue
            act += 1
            # pays if the value it delivers beats the price, after the pull of free competitors
            value = wtp * fit * (1 - 0.5 * comp)
            p_pay = 1 / (1 + math.exp(-3 * (value / price - 1)))
            p_pay *= 0.35  # habit, trust and payment friction: most "would pay" never do
            if random.random() < p_pay:
                paid += 1
                revenue += price
            for f in w:
                feature_gap[f] += w[f] * (1 - cover.get(f, 0)) * (wtp / (wtp_med or 1)) * (price if cur == '$' else price / 85)
        res[name] = dict(n=n, act=act, paid=paid, revenue=revenue, cur=cur, price=price)
    return res, feature_gap


def show(title, res):
    print(f'\n=== {title} ===')
    print(f"{'Segment':36} {'Owners':>6} {'Activate':>9} {'Pay':>5} {'Pay %':>6} {'MRR':>10}")
    tot_usd = 0.0
    for name, r in res.items():
        mrr_usd = r['revenue'] if r['cur'] == '$' else r['revenue'] / 85
        tot_usd += mrr_usd
        mrr = f"{r['cur']}{r['revenue']:,.0f}"
        print(f"{name:36} {r['n']:>6} {r['act']:>9} {r['paid']:>5} {100 * r['paid'] / r['n']:>5.1f}% {mrr:>10}")
    paid = sum(r['paid'] for r in res.values())
    print(f"{'TOTAL':36} {1000:>6} {sum(r['act'] for r in res.values()):>9} {paid:>5} {paid / 10:>5.1f}%  ≈ ${tot_usd:,.0f}/mo")


today, gap_today = simulate(TODAY)
road, _ = simulate(ROADMAP)
show('Today (features as built)', today)
show('After the proposed roadmap', road)

print('\n=== Most valuable missing features today (money-weighted gap, top 12) ===')
for f, g in sorted(gap_today.items(), key=lambda kv: -kv[1])[:12]:
    print(f'{g:10.0f}  {FEATURES[f]}')
