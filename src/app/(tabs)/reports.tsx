import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { billedStats, byCustomer, byResource, earningsByDay, hourlyStats, summary } from '../../db/repo';
import { useLive } from '../../ui/hooks';
import { AmountText } from '../../ui/components';
import { BarChart, Label, ListGroup, ListItem, ProBadge, ProLock, ScreenHeader, Segmented, ShareBar, StatTile, SummaryCard } from '../../ui/premium';
import { formatDuration } from '../../core/time';
import { formatINR } from '../../core/money';
import { hasFeature } from '../../billing/plan';
import { exportEntriesCsv } from '../../data/account';
import { fuelByResource, profitByResource } from '../../data/expenses';
import { exportInvoices } from '../../data/exports';
import { brand, radius, tabular } from '../../ui/theme';

type Kind = 'week' | 'month' | 'last';
const DAY = 86400000;
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** [from, to) for the chosen period and for the one before it. */
function ranges(kind: Kind) {
  const d = new Date();
  if (kind === 'week') {
    const s = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
    const e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7);
    const ps = new Date(s.getFullYear(), s.getMonth(), s.getDate() - 7);
    return { from: s.getTime(), to: e.getTime(), prevFrom: ps.getTime(), prevTo: s.getTime() };
  }
  const off = kind === 'last' ? -1 : 0;
  const s = new Date(d.getFullYear(), d.getMonth() + off, 1);
  const e = new Date(d.getFullYear(), d.getMonth() + off + 1, 1);
  const ps = new Date(d.getFullYear(), d.getMonth() + off - 1, 1);
  return { from: s.getTime(), to: e.getTime(), prevFrom: ps.getTime(), prevTo: s.getTime() };
}

/** Earnings bars: 7 days for a week; 7-day blocks (1–7, 8–14, …) for a month. */
function bars(kind: Kind, from: number, to: number) {
  const days = Math.round((to - from) / DAY);
  const daily = earningsByDay(from, days);
  const todayIdx = Math.floor((Date.now() - from) / DAY);
  if (kind === 'week') {
    return { data: daily.map((v, i) => ({ label: DAYS[i], value: v })), highlight: todayIdx >= 0 && todayIdx < 7 ? todayIdx : undefined };
  }
  const out: { label: string; value: number }[] = [];
  for (let i = 0; i < daily.length; i += 7) {
    out.push({ label: `${i + 1}–${Math.min(i + 7, daily.length)}`, value: daily.slice(i, i + 7).reduce((a, b) => a + b, 0) });
  }
  return { data: out, highlight: kind === 'month' && todayIdx >= 0 ? Math.floor(todayIdx / 7) : undefined };
}

// RP-1 (Free): totals for the period. RP-2 (Pro): charts, comparison, hourly rate, forecast, customers and resources.
export default function Reports() {
  const [kind, setKind] = useState<Kind>('month');
  const r = ranges(kind);
  const s = useLive(() => summary(r.from, r.to), [r.from, r.to]);
  const prev = useLive(() => summary(r.prevFrom, r.prevTo), [r.prevFrom, r.prevTo]);
  const hourly = useLive(() => hourlyStats(r.from, r.to), [r.from, r.to]);
  const billed = useLive(() => billedStats(r.from, r.to), [r.from, r.to]);
  const cust = useLive(() => byCustomer(r.from, r.to), [r.from, r.to]);
  const res = useLive(() => byResource(r.from, r.to), [r.from, r.to]);
  const chart = useLive(() => bars(kind, r.from, r.to), [kind, r.from, r.to]);
  const pro = hasFeature('insights');
  const profit = useLive(() => profitByResource(r.from, r.to), [r.from, r.to]);
  const fuel = useLive(() => fuelByResource(r.from, r.to), [r.from, r.to]);

  const change = prev.earnedPaise > 0 ? Math.round(((s.earnedPaise - prev.earnedPaise) / prev.earnedPaise) * 100) : null;
  const prevWord = kind === 'week' ? 'last week' : 'previous month';
  // Forecast only for the current month, and only once a few days have passed (too noisy before that).
  const daysInMonth = Math.round((r.to - r.from) / DAY);
  const elapsed = Math.min(daysInMonth, Math.max(1, Math.ceil((Date.now() - r.from) / DAY)));
  const forecast = kind === 'month' && elapsed >= 5 ? Math.round((s.earnedPaise / elapsed) * daysInMonth) : null;
  const topTotal = cust.reduce((a, c) => a + (c.earned || 0), 0) || 1;
  const unlock = () => router.push({ pathname: '/paywall', params: { trigger: 'insights' } });

  return (
    <View style={{ flex: 1, backgroundColor: brand.bg }}>
      <ScreenHeader title="Reports" subtitle="How your work is going" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 16 }} showsVerticalScrollIndicator={false}>
        <Segmented<Kind> value={kind} onChange={setKind} options={[
          { value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }, { value: 'last', label: 'Last month' },
        ]} />

        {/* Free: the essentials */}
        <SummaryCard>
          <Label dark>Earned</Label>
          <Text style={[tabular, { color: '#fff', fontSize: 34, fontWeight: '800', letterSpacing: -0.6, marginTop: 2 }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatINR(s.earnedPaise)}
          </Text>
          <Text style={{ color: brand.onDarkMuted, marginTop: 2 }}>{formatDuration(s.seconds)} logged</Text>
        </SummaryCard>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <StatTile icon="cash-check" accent={brand.money} label="Collected" node={<AmountText paise={s.collectedPaise} tone="received" style={{ fontSize: 19 }} />} />
          <StatTile icon="cash-clock" accent={brand.pending} label="Still to collect" node={<AmountText paise={s.pendingPaise} tone="pending" style={{ fontSize: 19 }} />} />
        </View>

        {/* Pro: the analysis */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: brand.ink }}>Analysis</Text>
          <ProBadge small />
        </View>

        <ProLock locked={!pro} preview="chart" title="Earnings chart" body="Your earnings by day or week, and the change from the last period." onUnlock={unlock}>
          <View style={{ backgroundColor: brand.surface, borderRadius: radius.md, padding: 16, borderWidth: 1, borderColor: brand.line }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: brand.ink }}>{kind === 'week' ? 'By day' : 'By week of the month'}</Text>
              {change !== null ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialCommunityIcons name={change >= 0 ? 'arrow-up' : 'arrow-down'} size={14} color={change >= 0 ? brand.money : brand.danger} />
                  <Text style={{ color: change >= 0 ? brand.money : brand.danger, fontWeight: '800', fontSize: 13 }}>{Math.abs(change)}%</Text>
                  <Text style={{ color: brand.muted, fontSize: 13 }}> vs {prevWord}</Text>
                </View>
              ) : null}
            </View>
            <BarChart data={chart.data} highlight={chart.highlight} formatValue={(v) => formatINR(v)} />
          </View>
        </ProLock>

        <ProLock locked={!pro} preview="tiles" title="Your real numbers" body="What you earn per hour, a month-end estimate, and how many bills are fully paid." onUnlock={unlock}>
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <StatTile icon="clock-check-outline" label="Earned per hour" node={<AmountText paise={hourly.perHourPaise} style={{ fontSize: 19 }} />} />
              <StatTile icon="calendar-arrow-right" label={forecast !== null ? 'At this pace, month ends at' : `Earned ${prevWord}`}
                node={<AmountText paise={forecast ?? prev.earnedPaise} style={{ fontSize: 19 }} />} />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <StatTile icon="file-send-outline" label="Billed in this period" node={<AmountText paise={billed.billedPaise} style={{ fontSize: 19 }} />} />
              <StatTile icon="check-all" label="Bills fully paid" value={billed.sentBills ? `${billed.paidBills} of ${billed.sentBills}` : '—'} />
            </View>
          </View>
        </ProLock>

        <ProLock locked={!pro} preview="list" title="Best customers and earners" body="Which customers, services, machines or vehicles bring in the most money." onUnlock={unlock}>
          <ListGroup title="Top customers">
            {cust.length === 0 ? <ListItem title="No work logged in this period" /> : null}
            {cust.slice(0, 5).map((c, i) => (
              <View key={c.name} style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ width: 20, color: brand.muted, fontWeight: '800' }}>{i + 1}</Text>
                  <Text style={{ flex: 1, color: brand.ink, fontWeight: '600' }} numberOfLines={1}>{c.name}</Text>
                  <Text style={{ color: brand.muted, marginRight: 10, fontSize: 13 }}>{formatDuration(c.secs || 0)}</Text>
                  <AmountText paise={c.earned || 0} />
                </View>
                <ShareBar fraction={(c.earned || 0) / topTotal} />
              </View>
            ))}
          </ListGroup>
          {res.length > 0 ? (
            <ListGroup title="By service, machine or vehicle" style={{ marginTop: 16 }}>
              {res.map((x) => (
                <ListItem key={x.name} icon="toolbox-outline" title={x.name} subtitle={formatDuration(x.secs || 0)}
                  right={<AmountText paise={x.earned || 0} />} />
              ))}
            </ListGroup>
          ) : null}
        </ProLock>

        <ProLock locked={!hasFeature('profit')} plan="business" preview="list" title="Profit per machine"
          body="What each machine, vehicle or service earns after fuel, repairs and pay." onUnlock={() => router.push({ pathname: '/paywall', params: { trigger: 'profit' } })}>
          <ListGroup title="Profit (earned − spent)">
            {profit.length === 0 ? <ListItem icon="information-outline" title="Add expenses to see profit" subtitle="More → Expenses" onPress={() => router.push('/expenses')} /> : null}
            {profit.map((p) => (
              <View key={p.name} style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ flex: 1, fontWeight: '700', color: brand.ink }} numberOfLines={1}>{p.name}</Text>
                  <AmountText paise={p.profit} tone={p.profit >= 0 ? 'received' : 'danger'} />
                </View>
                <Text style={{ color: brand.muted, fontSize: 12, marginTop: 2 }}>
                  Earned {formatINR(p.earned)} · spent {formatINR(p.spent)}
                  {fuel.find((f) => f.name === p.name && f.litres) ? ` · ${fuel.find((f) => f.name === p.name)!.litres} L fuel` : ''}
                </Text>
              </View>
            ))}
          </ListGroup>
        </ProLock>

        <ListGroup>
          <ListItem icon="microsoft-excel" iconColor={brand.money} title="Export to Excel / CSV" subtitle="All entries, for your accountant or records"
            right={hasFeature('exports') ? undefined : <ProBadge small />}
            onPress={() => (hasFeature('exports') ? exportEntriesCsv() : router.push({ pathname: '/paywall', params: { trigger: 'exports' } }))} />
        </ListGroup>
        <ListGroup title="For your accountant (bills in this period)">
          {([['xero', 'Xero', 'Sales invoice import file'], ['quickbooks', 'QuickBooks', 'Invoice import file'], ['register', 'Tally / any accountant', 'Sales register, one row per bill']] as const).map(([f, title, sub]) => (
            <ListItem key={f} icon="calculator-variant-outline" title={title} subtitle={sub}
              right={hasFeature('accounting-export') ? undefined : <ProBadge small plan="business" />}
              onPress={() => (hasFeature('accounting-export') ? exportInvoices(f, r.from, r.to) : router.push({ pathname: '/paywall', params: { trigger: 'accounting-export' } }))} />
          ))}
        </ListGroup>
      </ScrollView>
    </View>
  );
}
