import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { billEntries, billItems, billLabel, deleteDraftBill, getBill, getWorkspace, type EntryRow } from '../../db/repo';
import { useLive } from '../../ui/hooks';
import { AmountText, SourceBadge, StatusBadge, Tap } from '../../ui/components';
import { Avatar, Label, ListGroup, SummaryCard } from '../../ui/premium';
import { formatDuration } from '../../core/time';
import { meterHours } from '../../core/gst';
import { formatINR } from '../../core/money';
import { UNIT_LABEL } from '../../core/rate';
import { shareBillOnWhatsApp, shareBillPdf } from '../../bills/share';
import { payTarget, taxLines } from '../../bills/html';
import { region } from '../../core/region';
import { confirmBadge } from '../../proof/confirm';
import { brand, radius, tabular } from '../../ui/theme';
import { haptic } from '../../ui/haptics';

const d = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const dy = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const DAY = 86400000;

/** How much work, in plain words: "2h 30m", "180 km (GPS)", "3 days", "1 job". */
function workText(e: EntryRow) {
  const mh = meterHours(e.meterStart, e.meterEnd);
  if (e.unit === 'km') {
    const km = e.quantity ?? mh ?? 0;
    return `${km} km${mh !== null ? ` · dashboard ${e.meterStart} → ${e.meterEnd}` : e.gpsKm != null ? ' · GPS' : ''}`;
  }
  if (e.unit === 'hour') return `${formatDuration(e.billableSeconds)}${mh !== null ? ` · hours counter ${e.meterStart} → ${e.meterEnd}` : ''}`;
  const q = e.quantity ?? 1;
  return `${q} ${UNIT_LABEL[e.unit]?.[q === 1 ? 'one' : 'many'] ?? e.unit}`;
}

export default function BillScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const bill = useLive(() => getBill(id), [id]);
  const ws = useLive(() => getWorkspace(), []);
  const entries = useLive(() => billEntries(id), [id]);
  const items = useLive(() => billItems(id), [id]);
  if (!bill) return null;

  const tax = bill.taxPaise ?? 0;
  const half = Math.round(tax / 2);
  const isTax = tax > 0;
  const overdue = !!bill.dueAt && bill.status !== 'paid' && bill.status !== 'draft' && Date.now() > bill.dueAt;
  const daysLeft = bill.dueAt ? Math.ceil((bill.dueAt - Date.now()) / DAY) : null;
  const workTotal = entries.reduce((s, e) => s + e.amountPaise, 0);
  const itemsTotal = items.reduce((s, i) => s + Math.round(i.amountPaise * i.quantity), 0);

  const statusLine = bill.status === 'paid' ? 'Paid in full'
    : bill.status === 'draft' ? 'Draft — not sent yet'
      : overdue ? `Overdue since ${d(bill.dueAt!)}`
        : bill.dueAt ? (daysLeft! <= 0 ? 'Due today' : `Due in ${daysLeft} day${daysLeft === 1 ? '' : 's'} · ${d(bill.dueAt)}`)
          : bill.sentAt ? `Sent on ${d(bill.sentAt)}` : 'Waiting for payment';

  return (
    <View style={{ flex: 1, backgroundColor: brand.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 150 }} showsVerticalScrollIndicator={false}>
        {/* Amount due */}
        <SummaryCard>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Label dark style={{ flex: 1 }}>{isTax ? 'Tax invoice' : 'Bill'} {billLabel(ws, bill.number)}</Label>
            <StatusBadge status={bill.status} />
          </View>
          <Text style={[tabular, { color: '#fff', fontSize: 36, fontWeight: '800', letterSpacing: -0.8, marginTop: 8 }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatINR(bill.totalPaise)}
          </Text>
          <Text style={{ color: brand.onDarkMuted }}>Total due</Text>
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 14 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <MaterialCommunityIcons name={bill.status === 'paid' ? 'check-circle' : overdue ? 'alert-circle' : 'calendar-clock'} size={18}
              color={bill.status === 'paid' ? '#6EE7B7' : overdue ? '#FFB4A6' : '#fff'} />
            <Text style={{ color: overdue ? '#FFB4A6' : '#fff', marginLeft: 8, fontWeight: '600', flex: 1 }}>{statusLine}</Text>
          </View>
        </SummaryCard>

        {/* Bill to */}
        <Tap onPress={() => router.push(`/customer/${bill.customerId}`)} label={`Open ${bill.customerName}`}>
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Avatar name={bill.customerName} size={44} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 12, color: brand.muted }}>Bill to</Text>
                <Text style={{ fontSize: 17, fontWeight: '800', color: brand.ink }} numberOfLines={1}>{bill.customerName}</Text>
                {bill.customerGstin ? <Text style={{ fontSize: 13, color: brand.muted }}>GSTIN {bill.customerGstin}</Text> : null}
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color="#B5B0A4" />
            </View>
            <View style={{ flexDirection: 'row', marginTop: 14, gap: 10 }}>
              <Meta icon="calendar-range" label="Work period" value={`${d(bill.periodFrom)} – ${d(bill.periodTo)}`} />
              <Meta icon="file-clock-outline" label="Bill date" value={dy(bill.updatedAt)} />
            </View>
          </View>
        </Tap>

        {/* Work */}
        <ListGroup title={`Work · ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}>
          {entries.map((e) => (
            <View key={e.id} style={styles.line}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={{ fontWeight: '700', color: brand.ink }} numberOfLines={1}>
                  {[e.resourceName, e.siteName, e.variantName].filter(Boolean).join(' · ')}
                </Text>
                <Text style={{ color: brand.muted, fontSize: 13, marginTop: 1 }}>{d(e.startedAt)} · {workText(e)}</Text>
                {e.note ? <Text style={{ color: brand.muted, fontSize: 12, marginTop: 1 }} numberOfLines={2}>{e.note}</Text> : null}
                {e.gpsFrom || e.gpsTo ? <Text style={{ color: brand.muted, fontSize: 12, marginTop: 1 }} numberOfLines={1}>{e.gpsFrom ?? '?'} → {e.gpsTo ?? '?'}</Text> : null}
                {confirmBadge(e.confirmationStatus) ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                    <MaterialCommunityIcons name={confirmBadge(e.confirmationStatus)!.icon as any} size={14}
                      color={e.confirmationStatus === 'confirmed' ? brand.money : brand.danger} />
                    <Text style={{ fontSize: 12, marginLeft: 4, fontWeight: '700', color: e.confirmationStatus === 'confirmed' ? brand.money : brand.danger }}>
                      {confirmBadge(e.confirmationStatus)!.text}
                    </Text>
                  </View>
                ) : null}
                <View style={{ marginTop: 3 }}><SourceBadge source={e.source} tamper={!!e.tamperFlag} /></View>
              </View>
              <AmountText paise={e.amountPaise} />
            </View>
          ))}
        </ListGroup>

        {/* Materials */}
        {items.length ? (
          <ListGroup title="Materials & charges">
            {items.map((i, k) => (
              <View key={k} style={styles.line}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={{ fontWeight: '600', color: brand.ink }} numberOfLines={1}>{i.description}</Text>
                  <Text style={{ color: brand.muted, fontSize: 13 }}>{i.quantity} × {formatINR(i.amountPaise)}</Text>
                </View>
                <AmountText paise={Math.round(i.amountPaise * i.quantity)} />
              </View>
            ))}
          </ListGroup>
        ) : null}

        {/* Totals */}
        <View style={styles.card}>
          {items.length ? <Line label="Work" paise={workTotal} /> : null}
          {items.length ? <Line label="Materials & charges" paise={itemsTotal} /> : null}
          <Line label={isTax ? 'Taxable value' : 'This bill'} paise={bill.subtotalPaise} strong={!isTax && !bill.previousBalancePaise && !bill.tdsPaise} />
          {taxLines(bill).map((t) => <Line key={t.label} label={t.label} paise={t.paise} />)}
          {bill.previousBalancePaise ? (
            <Line label={bill.previousBalancePaise > 0 ? 'Earlier balance' : 'Paid in advance'} paise={bill.previousBalancePaise} />
          ) : null}
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: brand.line, marginVertical: 8 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: brand.ink }}>Total due</Text>
            <AmountText paise={bill.totalPaise} style={{ fontSize: 22 }} />
          </View>
          {ws && payTarget(ws, bill.totalPaise, String(bill.number)) ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
              <MaterialCommunityIcons name="qrcode" size={16} color={brand.muted} />
              <Text style={{ color: brand.muted, fontSize: 13, marginLeft: 6 }}>
                {region().upi ? `UPI QR for ${ws.upiId} is printed on the bill` : 'A pay link and QR are printed on the bill'}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Secondary actions */}
        <ListGroup>
          <Action icon="eye-outline" title="Preview bill" subtitle="See it exactly as the customer will" onPress={() => router.push({ pathname: '/bill/preview', params: { id } })} />
          <Action icon="cash-plus" title="Payment received" subtitle="Record cash, UPI or bank" onPress={() => router.push({ pathname: '/payment/new', params: { customerId: bill.customerId } })} />
          {bill.status === 'draft' ? (
            <Action icon="delete-outline" danger title="Discard draft" subtitle="The work goes back to unbilled"
              onPress={() => { haptic.warn(); deleteDraftBill(id); router.back(); }} />
          ) : null}
        </ListGroup>
      </ScrollView>

      {/* Main actions */}
      <SafeAreaView edges={['bottom']} style={styles.bar}>
        <View style={{ flexDirection: 'row', gap: 10, padding: 12 }}>
          <Tap onPress={() => { haptic.press(); void shareBillOnWhatsApp(id); }} label="Send on WhatsApp" style={{ flex: 1.3 }}>
            <View style={[styles.btn, { backgroundColor: '#1FA855' }]}>
              <MaterialCommunityIcons name="whatsapp" size={20} color="#fff" />
              <Text style={styles.btnText}>{bill.status === 'draft' ? 'Send on WhatsApp' : 'Send again'}</Text>
            </View>
          </Tap>
          <Tap onPress={() => { haptic.press(); void shareBillPdf(id); }} label="Share PDF" style={{ flex: 1 }}>
            <View style={[styles.btn, { backgroundColor: brand.surface, borderWidth: 1.5, borderColor: brand.line }]}>
              <MaterialCommunityIcons name="file-pdf-box" size={20} color={brand.primary} />
              <Text style={[styles.btnText, { color: brand.primary }]}>PDF</Text>
            </View>
          </Tap>
        </View>
      </SafeAreaView>
    </View>
  );
}

function Meta({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: brand.bg, borderRadius: radius.sm, padding: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <MaterialCommunityIcons name={icon as any} size={14} color={brand.muted} />
        <Text style={{ fontSize: 11, color: brand.muted, marginLeft: 4 }}>{label}</Text>
      </View>
      <Text style={{ fontWeight: '700', color: brand.ink, marginTop: 2 }} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function Line({ label, paise, strong }: { label: string; paise: number; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3 }}>
      <Text style={{ flex: 1, fontSize: 15, color: strong ? brand.ink : brand.muted, fontWeight: strong ? '700' : '400' }}>{label}</Text>
      <AmountText paise={paise} style={{ fontSize: 15 }} />
    </View>
  );
}

function Action({ icon, title, subtitle, onPress, danger }: { icon: string; title: string; subtitle: string; onPress: () => void; danger?: boolean }) {
  return (
    <Tap onPress={onPress} label={title}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: danger ? brand.dangerSoft : brand.tint, alignItems: 'center', justifyContent: 'center' }}>
          <MaterialCommunityIcons name={icon as any} size={19} color={danger ? brand.danger : brand.primary} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontWeight: '700', color: danger ? brand.danger : brand.ink }}>{title}</Text>
          <Text style={{ fontSize: 12, color: brand.muted }}>{subtitle}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color="#B5B0A4" />
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: brand.surface, borderRadius: radius.md, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: brand.line },
  line: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(244,242,236,0.97)', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: brand.line },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.pill, minHeight: 52 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
