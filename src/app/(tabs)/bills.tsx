import React, { useMemo, useState } from 'react';
import { isOperator } from '../../data/membership';
import { t } from '../../i18n';
import { Alert, SectionList, StyleSheet, View } from 'react-native';
import { Button, Dialog, Portal, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { billLabel, createBill, getWorkspace, listBills, listCustomers, unbilledFor, unbilledSummary } from '../../db/repo';
import { useLive } from '../../ui/hooks';
import { hasFeature } from '../../billing/plan';
import { AmountText, EmptyState, Picker, StatusBadge, Tap } from '../../ui/components';
import { FilterChips, ListItem, ScreenHeader, StatTile } from '../../ui/premium';
import { formatINR } from '../../core/money';
import { brand, radius } from '../../ui/theme';
import { haptic } from '../../ui/haptics';

const FAR_PAST = 0;
const FAR_FUTURE = 8.64e15;
type Filter = 'all' | 'unpaid' | 'draft' | 'paid';

export default function Bills() {
  const bills = useLive(() => listBills(), []);
  const ws = useLive(() => getWorkspace(), []);
  const customers = useLive(() => listCustomers(), []);
  const unbilled = useLive(() => unbilledSummary(), []);
  const [creating, setCreating] = useState(false);
  const [custId, setCustId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [batchMsg, setBatchMsg] = useState<string | null>(null);
  const withUnbilled = customers.filter((c) => unbilledFor(c.id, FAR_PAST, FAR_FUTURE).length > 0);

  const pending = customers.reduce((s, c) => s + Math.max(0, c.balancePaise), 0);
  const counts = {
    unpaid: bills.filter((b) => b.status === 'sent' || b.status === 'partly_paid').length,
    draft: bills.filter((b) => b.status === 'draft').length,
    paid: bills.filter((b) => b.status === 'paid').length,
  };
  const shown = bills.filter((b) =>
    filter === 'all' ? true : filter === 'unpaid' ? b.status === 'sent' || b.status === 'partly_paid' : b.status === filter);

  // group by the month the bill period ends in
  const sections = useMemo(() => {
    const m = new Map<string, typeof shown>();
    for (const b of shown) {
      const k = new Date(b.periodTo).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      m.set(k, [...(m.get(k) ?? []), b]);
    }
    return [...m.entries()].map(([title, data]) => ({ title, data }));
  }, [shown]);

  const billEveryone = () => {
    if (!hasFeature('batch-billing')) { router.push({ pathname: '/paywall', params: { trigger: 'batch-billing' } }); return; }
    const ws = getWorkspace();
    if (!ws) return;
    let n = 0;
    for (const c of withUnbilled) {
      const p = billPeriod(c.id);
      if (createBill(ws.id, c.id, p.from, p.to, undefined, { gst: hasFeature('gst') })) n++;
    }
    haptic.success();
    setBatchMsg(n ? `Created ${n} draft bill${n > 1 ? 's' : ''}. Open each one to check and share it.` : 'Nothing to bill right now.');
  };
  const create = () => {
    const ws = getWorkspace();
    if (!ws || !custId) return;
    const p = billPeriod(custId);
    const id = createBill(ws.id, custId, p.from, p.to, undefined, { gst: hasFeature('gst') });
    setCreating(false);
    if (id) { haptic.success(); router.push(`/bill/${id}`); }
    else Alert.alert('Nothing to bill', 'This customer has no finished work that is not on a bill yet. A running timer must be stopped first.');
  };

  return (
    <View style={{ flex: 1, backgroundColor: brand.bg }}>
      <ScreenHeader title={t('bills.title')} subtitle={`${bills.length} bill${bills.length === 1 ? '' : 's'}`} action={isOperator() ? undefined : t('bills.new')} onAction={isOperator() ? undefined : () => setCreating(true)} />
      <SectionList
        sections={sections}
        keyExtractor={(b) => b.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        ListHeaderComponent={
          <View style={{ gap: 14, marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <StatTile icon="cash-clock" accent={brand.pending} label={t('bills.waiting')} node={<AmountText paise={pending} tone="pending" style={{ fontSize: 19 }} />} onPress={() => router.push('/to-collect')} />
              <StatTile icon="timer-sand" label={t('bills.notBilled')} node={<AmountText paise={unbilled.totalPaise} style={{ fontSize: 19 }} />} />
            </View>

            {isOperator() ? (
              <Text style={{ color: brand.muted }}>Bills are made by the owner. Your work goes to them automatically when you are online.</Text>
            ) : null}
            {withUnbilled.length > 0 && !isOperator() ? (
              <View style={styles.ready}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={styles.readyIcon}><MaterialCommunityIcons name="file-document-edit-outline" size={20} color={brand.primary} /></View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ fontWeight: '800', color: brand.ink, fontSize: 15 }}>{t('bills.ready')}</Text>
                    <Text style={{ color: brand.muted, fontSize: 13 }}>
                      {formatINR(unbilled.totalPaise)} for {withUnbilled.length} {withUnbilled.length === 1 ? 'person' : 'people'}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <Tap onPress={() => setCreating(true)} label="Bill one customer" style={{ flex: 1 }}>
                    <View style={[styles.btn, styles.btnOutline]}>
                      <MaterialCommunityIcons name="account-outline" size={18} color={brand.primary} />
                      <Text numberOfLines={1} style={[styles.btnText, { color: brand.primary }]}>{t('bills.one')}</Text>
                    </View>
                  </Tap>
                  {hasFeature('batch-billing') ? (
                    <Tap onPress={billEveryone} label="Bill everyone" style={{ flex: 1 }}>
                      <View style={[styles.btn, { backgroundColor: brand.primary }]}>
                        <MaterialCommunityIcons name="flash" size={18} color="#fff" />
                        <Text numberOfLines={1} style={[styles.btnText, { color: '#fff' }]}>{t('bills.everyone')}</Text>
                      </View>
                    </Tap>
                  ) : (
                    <Tap onPress={billEveryone} label="Bill everyone, Pro feature" style={{ flex: 1 }}>
                      <View style={[styles.btn, styles.btnOutline]}>
                        <MaterialCommunityIcons name="lock-outline" size={17} color={brand.muted} />
                        <Text numberOfLines={1} style={[styles.btnText, { color: brand.ink, flexShrink: 1 }]}>{t('bills.everyone')}</Text>
                        <Text style={styles.proTag}>PRO</Text>
                      </View>
                    </Tap>
                  )}
                </View>
                {batchMsg ? <Text style={{ marginTop: 8, color: brand.muted }}>{batchMsg}</Text> : null}
              </View>
            ) : null}

            {bills.length > 0 ? (
              <FilterChips<Filter> value={filter} onChange={setFilter} options={[
                { value: 'all', label: 'All', count: bills.length },
                { value: 'unpaid', label: 'Unpaid', count: counts.unpaid },
                { value: 'draft', label: 'Drafts', count: counts.draft },
                { value: 'paid', label: 'Paid', count: counts.paid },
              ]} />
            ) : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionTitle}>{section.title}</Text>
        )}
        renderItem={({ item, index, section }) => (
          <View style={[styles.cell, index === 0 && styles.first, index === section.data.length - 1 && styles.last]}>
            <ListItem
              icon="file-document-outline"
              title={item.customerName}
              subtitle={`${item.taxPaise ? 'Tax invoice' : 'Bill'} ${billLabel(ws, item.number)} ·${new Date(item.periodFrom).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(item.periodTo).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
              right={<View style={{ alignItems: 'flex-end' }}><AmountText paise={item.subtotalPaise + (item.taxPaise ?? 0)} /><StatusBadge status={item.status} /></View>}
              onPress={() => router.push(`/bill/${item.id}`)}
            />
            {index < section.data.length - 1 ? <View style={styles.divider} /> : null}
          </View>
        )}
        ListEmptyComponent={
          bills.length === 0
            ? <EmptyState icon="file-document-outline" text={withUnbilled.length ? 'No bills yet. Create one from the work above.' : 'No bills yet. Log some work first, then bill it here.'} />
            : <Text style={{ color: brand.muted, textAlign: 'center', marginTop: 24 }}>No bills in this list.</Text>
        }
      />

      <Portal>
        <Dialog visible={creating} onDismiss={() => setCreating(false)} style={{ backgroundColor: '#fff', borderRadius: radius.lg }}>
          <Dialog.Title>Bill which customer?</Dialog.Title>
          <Dialog.Content>
            {withUnbilled.length === 0 ? <Text>Nothing unbilled right now.</Text> : (
              <Picker items={withUnbilled} selected={custId} onSelect={setCustId} label={(c) => c.name} />
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCreating(false)}>Cancel</Button>
            <Button mode="contained" disabled={!custId} onPress={create}>Preview bill</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

/**
 * The bill covers every unbilled entry of the customer: from the earliest to the latest one.
 * (Using "now" as the end left out work dated later today, e.g. a job saved for 9:00 while it is still night.)
 */
function billPeriod(customerId: string) {
  const e = unbilledFor(customerId, FAR_PAST, FAR_FUTURE);
  if (!e.length) return { from: Date.now(), to: Date.now() + 1 };
  const starts = e.map((x) => x.startedAt);
  return { from: Math.min(...starts), to: Math.max(Date.now(), ...starts) + 1 };
}

const styles = StyleSheet.create({
  ready: { backgroundColor: brand.surface, borderRadius: radius.md, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: brand.line },
  readyIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: brand.primarySoft, alignItems: 'center', justifyContent: 'center' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, minHeight: 46, paddingHorizontal: 12, gap: 6 },
  btnOutline: { borderWidth: 1.5, borderColor: brand.line, backgroundColor: brand.surface },
  btnText: { fontWeight: '700', fontSize: 14 },
  proTag: { fontSize: 10, fontWeight: '800', color: '#8A5E0E', backgroundColor: brand.goldSoft, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: brand.muted, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 16, marginBottom: 8, marginLeft: 4 },
  cell: { backgroundColor: brand.surface, borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: brand.line },
  first: { borderTopWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md, overflow: 'hidden' },
  last: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: brand.line, marginLeft: 64 },
});
