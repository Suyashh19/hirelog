import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LIMITS, PAYWALL_COPY, PLAN_FOR, PLAN_TABLE, perMonthText, priceText, savedPercent, type Period, type PlanId } from '../billing/plans';
import { region } from '../core/region';
import { buyPlan, iapAvailable, restorePurchases } from '../billing/iap';
import { getPlan } from '../billing/plan';
import { useLive } from '../ui/hooks';
import { Tap } from '../ui/components';
import { Segmented } from '../ui/premium';
import { brand, radius, tabular } from '../ui/theme';
import { haptic } from '../ui/haptics';

const NAME: Record<PlanId, string> = { free: 'Free', pro: 'Pro', business: 'Business' };
const PER: Record<Period, string> = { monthly: 'month', sixmonth: '6 months', yearly: 'year' };

/** The three numbers people compare first. */
function keyLimits(p: PlanId) {
  const l = LIMITS[p];
  return [
    { icon: 'toolbox-outline', text: `${l.resources} service${l.resources === 1 ? '' : 's'}, machine${l.resources === 1 ? '' : 's'} or vehicle${l.resources === 1 ? '' : 's'}` },
    { icon: 'account-group-outline', text: l.customers === null ? 'Unlimited customers' : `${l.customers} customers` },
    { icon: 'file-pdf-box', text: l.pdfPerMonth === null ? 'Unlimited PDF bills' : `${l.pdfPerMonth} PDF bills a month` },
  ];
}

/** Honest paywall: shown on a real limit, says exactly what changes, always closable, never deletes data. */
export default function Paywall() {
  const { trigger } = useLocalSearchParams<{ trigger?: string }>();
  const copy = PAYWALL_COPY[trigger ?? 'default'] ?? PAYWALL_COPY.default;
  const current = useLive(() => getPlan(), []);
  const [period, setPeriod] = useState<Period>('yearly');
  const [selected, setSelected] = useState<PlanId>(copy.plan);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const buy = async () => {
    if (selected === 'free') { router.back(); return; }
    haptic.press();
    setBusy(true); setMsg(null);
    const r = await buyPlan(selected, period);
    setBusy(false); setMsg(r.message);
    if (r.ok) { haptic.success(); setTimeout(() => router.back(), 900); }
  };

  const india = region().code === 'IN';
  const priceLabel = (p: PlanId) => (p === 'free' ? (india ? '₹0' : '$0') : priceText(p, period, india));
  const cta = selected === 'free'
    ? (current.plan === 'free' ? 'Continue with Free' : 'Close')
    : current.plan === selected ? `You have ${NAME[selected]}` : `Get ${NAME[selected]} · ${priceLabel(selected)} / ${PER[period]}`;

  return (
    <View style={{ flex: 1, backgroundColor: brand.bg }}>
      <SafeAreaView edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 6 }}>
          <View style={{ flex: 1 }} />
          <Tap onPress={() => router.back()} label="Close">
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: brand.tint, alignItems: 'center', justifyContent: 'center' }}>
              <MaterialCommunityIcons name="close" size={22} color={brand.ink} />
            </View>
          </Tap>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130, gap: 16 }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 26, fontWeight: '800', color: brand.ink, letterSpacing: -0.3 }}>{copy.title}</Text>
          <Text style={{ color: brand.muted, fontSize: 15 }}>{copy.body}</Text>
          {current.plan !== 'free' ? (
            <Text style={{ color: brand.money, fontWeight: '700', marginTop: 4 }}>
              You have {NAME[current.plan]}{current.source === 'founding' ? ' as a Founding Member' : ''}
              {current.expiresAt ? ` until ${new Date(current.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}.
            </Text>
          ) : null}
        </View>

        <Segmented<Period> value={period} onChange={setPeriod} options={[
          { value: 'monthly', label: 'Monthly' }, { value: 'sixmonth', label: '6 months' }, { value: 'yearly', label: `Yearly · save ${savedPercent('pro', 'yearly', india)}%` },
        ]} />

        {(['free', 'pro', 'business'] as const).map((p) => {
          const on = selected === p;
          const mine = current.plan === p;
          return (
            <Tap key={p} onPress={() => { haptic.tap(); setSelected(p); }} label={`${NAME[p]} plan`}>
              <View style={[styles.plan, on ? styles.planOn : null]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 19, fontWeight: '800', color: brand.ink }}>{NAME[p]}</Text>
                  {mine ? <View style={styles.mine}><Text style={styles.mineText}>YOUR PLAN</Text></View> : null}
                  <View style={{ flex: 1 }} />
                  <MaterialCommunityIcons name={on ? 'radiobox-marked' : 'radiobox-blank'} size={24} color={on ? brand.primary : '#C9C4B7'} />
                </View>
                <Text style={{ color: brand.muted, fontSize: 13, marginTop: 2 }}>{PLAN_FOR[p]}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 10 }}>
                  <Text style={[tabular, { fontSize: 28, fontWeight: '800', color: brand.ink }]}>{priceLabel(p)}</Text>
                  <Text style={{ fontSize: 14, color: brand.muted, marginLeft: 4, marginBottom: 5 }}>{p === 'free' ? 'forever' : `/ ${PER[period]}`}</Text>
                </View>
                {p !== 'free' && period !== 'monthly' ? (
                  <Text style={{ color: brand.money, fontWeight: '700', fontSize: 13 }}>≈ {perMonthText(p, period, india)} a month · save {savedPercent(p, period, india)}% vs monthly</Text>
                ) : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  {keyLimits(p).map((k) => (
                    <View key={k.text} style={styles.limit}>
                      <MaterialCommunityIcons name={k.icon as any} size={15} color={brand.primary} />
                      <Text style={{ marginLeft: 5, fontSize: 13, color: brand.ink, fontWeight: '600' }}>{k.text}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </Tap>
          );
        })}

        {/* Full comparison */}
        <Text style={{ fontSize: 18, fontWeight: '800', color: brand.ink, marginTop: 8 }}>Compare plans</Text>
        <View style={styles.table}>
          <View style={[styles.tr, { backgroundColor: brand.tint }]}>
            <Text style={[styles.tdLabel, { fontWeight: '800' }]}> </Text>
            {(['free', 'pro', 'business'] as const).map((p) => (
              <Text key={p} style={[styles.td, { fontWeight: '800', color: selected === p ? brand.primary : brand.ink }]}>{NAME[p]}</Text>
            ))}
          </View>
          {PLAN_TABLE.map((g) => (
            <View key={g.group}>
              <Text style={styles.group}>{g.group}</Text>
              {g.rows.map((r) => (
                <View key={r.label} style={styles.tr}>
                  <View style={styles.tdLabelBox}>
                    <Text style={styles.tdLabelText}>{r.label}</Text>
                    {r.soon ? <Text style={styles.soon}>Coming soon</Text> : null}
                  </View>
                  {([r.free, r.pro, r.business] as const).map((v, i) => (
                    <Text key={i} style={[styles.td, v === '—' ? { color: '#B5B0A4' } : null]}>{v}</Text>
                  ))}
                </View>
              ))}
            </View>
          ))}
        </View>

        <View style={{ gap: 6 }}>
          {['Cancel any time in Google Play', 'If you stop paying, your data stays. Only the extras lock.', 'No ads on any plan'].map((t) => (
            <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialCommunityIcons name="check" size={16} color={brand.money} />
              <Text style={{ color: brand.muted, fontSize: 13 }}>{t}</Text>
            </View>
          ))}
        </View>
        <Button onPress={async () => { const r = await restorePurchases(); setMsg(r.message); }} textColor={brand.muted}>Restore purchases</Button>
        {msg ? <Text style={{ color: brand.ink, textAlign: 'center' }}>{msg}</Text> : null}
        {!iapAvailable() ? <Text style={{ color: brand.muted, fontSize: 12, textAlign: 'center' }}>Payments open in the Play Store version of the app. Plans renew automatically until you cancel in Google Play.</Text> : null}
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.bar}>
        <View style={{ padding: 16 }}>
          <Tap onPress={buy} disabled={busy || (selected !== 'free' && current.plan === selected)} label={cta}>
            <View style={[styles.cta, selected === 'free' ? { backgroundColor: brand.ink } : null, busy ? { opacity: 0.7 } : null]}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>{busy ? 'Opening Google Play…' : cta}</Text>
            </View>
          </Tap>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  plan: { backgroundColor: brand.surface, borderRadius: radius.md, padding: 16, borderWidth: 1.5, borderColor: brand.line },
  planOn: { borderColor: brand.primary, backgroundColor: '#FBFDFC' },
  mine: { marginLeft: 8, backgroundColor: brand.moneySoft, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  mineText: { color: brand.money, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  limit: { flexDirection: 'row', alignItems: 'center', backgroundColor: brand.tint, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  table: { backgroundColor: brand.surface, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: brand.line, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: brand.line, paddingVertical: 10, paddingHorizontal: 10 },
  tdLabel: { flex: 1.6, fontSize: 13, color: brand.ink },
  tdLabelBox: { flex: 1.6, paddingRight: 6 },
  tdLabelText: { fontSize: 13, color: brand.ink },
  soon: { fontSize: 10, color: '#8A5E0E', fontWeight: '700', marginTop: 2 },
  td: { flex: 1, fontSize: 12, color: brand.ink, textAlign: 'center', paddingHorizontal: 2 },
  group: { fontSize: 11, fontWeight: '800', color: brand.muted, letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 10, paddingTop: 14, paddingBottom: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: brand.line },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(244,242,236,0.97)', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: brand.line },
  cta: { backgroundColor: brand.primary, borderRadius: radius.pill, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
});
