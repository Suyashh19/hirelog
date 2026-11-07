import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, SectionList, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { listCustomers, listEntries, listResources, type EntryRow } from '../db/repo';
import { useLive } from '../ui/hooks';
import { AmountText, EmptyState, SourceBadge, Tap } from '../ui/components';
import { formatDuration } from '../core/time';
import { getPlan } from '../billing/plan';
import { LIMITS } from '../billing/plans';
import { brand, radius } from '../ui/theme';

type Billed = 'all' | 'unbilled' | 'billed';

const dayKey = (ms: number) => new Date(ms).toDateString();
const dayLabel = (ms: number) => {
  const d = new Date(ms);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

/** EN-2: every entry, grouped by day, filterable by resource, customer and billed status. */
export default function Entries() {
  const [billed, setBilled] = useState<Billed>('all');
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);

  const resources = useLive(() => listResources(), []);
  const customers = useLive(() => listCustomers(), []);
  const plan = useLive(() => getPlan(), []);
  const rows = useLive(
    () => listEntries({ billed: billed === 'all' ? undefined : billed, resourceId: resourceId ?? undefined, customerId: customerId ?? undefined, limit: 1000 }),
    [billed, resourceId, customerId],
  );

  const historyDays = LIMITS[plan.plan].historyDays;
  const isLocked = (e: EntryRow) => historyDays !== null && Date.now() - e.startedAt > historyDays * 86400000;

  const sections = useMemo(() => {
    const map = new Map<string, { title: string; data: EntryRow[]; total: number; secs: number }>();
    for (const e of rows) {
      const k = dayKey(e.startedAt);
      if (!map.has(k)) map.set(k, { title: dayLabel(e.startedAt), data: [], total: 0, secs: 0 });
      const s = map.get(k)!;
      s.data.push(e);
      s.total += e.amountPaise + e.itemsPaise;
      s.secs += e.billableSeconds;
    }
    return [...map.values()];
  }, [rows]);

  const filtered = billed !== 'all' || !!resourceId || !!customerId;

  return (
    <View style={{ flex: 1, backgroundColor: brand.bg }}>
      <View style={{ paddingVertical: 8, gap: 6 }}>
        <Chips label="Status" value={billed} onChange={(v) => setBilled(v as Billed)}
          options={[{ id: 'all', name: 'All' }, { id: 'unbilled', name: 'Not billed' }, { id: 'billed', name: 'Billed' }]} />
        {resources.length > 1 ? (
          <Chips label="Resource" value={resourceId ?? ''} onChange={(v) => setResourceId(v || null)} options={[{ id: '', name: 'All' }, ...resources]} />
        ) : null}
        {customers.length > 0 ? (
          <Chips label="Customer" value={customerId ?? ''} onChange={(v) => setCustomerId(v || null)} options={[{ id: '', name: 'All' }, ...customers]} />
        ) : null}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ paddingBottom: 60 }}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={<EmptyState icon="timer-sand" text={filtered ? 'Nothing matches these filters.' : 'No work logged yet. Start the timer on Home.'} />}
        renderSectionHeader={({ section }) => (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 }}>
            <Text style={{ fontWeight: '800', color: brand.ink }}>{section.title}</Text>
            <Text style={{ color: brand.muted }}>{formatDuration(section.secs)} · <AmountText paise={section.total} style={{ fontSize: 14 }} /></Text>
          </View>
        )}
        renderItem={({ item: e }) => {
          const locked = isLocked(e);
          const detail = [e.customerName, e.siteName, e.variantName].filter(Boolean).join(' · ');
          return (
            <Tap onPress={() => (locked ? router.push({ pathname: '/paywall', params: { trigger: 'default' } }) : router.push(`/entry/${e.id}`))}>
              <View style={{ marginHorizontal: 16, marginBottom: 8, padding: 14, backgroundColor: '#fff', borderRadius: radius.md, borderWidth: 1, borderColor: brand.line, opacity: locked ? 0.55 : 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text numberOfLines={1} style={{ fontWeight: '700', color: brand.ink, fontSize: 16 }}>{e.resourceName}{detail ? ` · ${detail}` : ''}</Text>
                    <Text style={{ color: brand.muted }}>
                      {new Date(e.startedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · {e.unit === 'hour' ? formatDuration(e.billableSeconds) : `${e.quantity ?? 1} ${e.unit}`}
                    </Text>
                  </View>
                  {locked
                    ? <MaterialCommunityIcons name="lock-outline" size={20} color={brand.muted} />
                    : <AmountText paise={e.amountPaise + e.itemsPaise} />}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                  <SourceBadge source={e.source} tamper={!!e.tamperFlag} />
                  {e.status === 'billed' ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <MaterialCommunityIcons name="file-check-outline" size={14} color={brand.money} />
                      <Text variant="bodySmall" style={{ color: brand.money, marginLeft: 3 }}>Billed</Text>
                    </View>
                  ) : null}
                </View>
                {locked ? <Text variant="bodySmall" style={{ color: brand.muted, marginTop: 4 }}>Older than {historyDays} days — Pro shows your full history</Text> : null}
              </View>
            </Tap>
          );
        }}
      />
    </View>
  );
}

function Chips({ label, value, onChange, options }: {
  label: string; value: string; onChange: (id: string) => void; options: { id: string; name: string }[];
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text style={{ width: 78, paddingLeft: 16, color: brand.muted, fontSize: 12 }}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 16 }}>
        {options.map((o) => {
          const on = o.id === value;
          return (
            <Pressable key={o.id || 'all'} onPress={() => onChange(o.id)} accessibilityRole="button" accessibilityState={{ selected: on }}
              style={{ paddingHorizontal: 14, minHeight: 36, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: on ? brand.primary : brand.line, backgroundColor: on ? brand.primarySoft : '#fff' }}>
              <Text style={{ color: on ? brand.primary : brand.ink, fontWeight: on ? '700' : '400' }}>{o.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
