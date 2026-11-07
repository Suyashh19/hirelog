import React, { useState } from 'react';
import { isOperator } from '../../data/membership';
import { FlatList, StyleSheet, View } from 'react-native';
import { Searchbar, Text } from 'react-native-paper';
import { router } from 'expo-router';
import { getWorkspace, listCustomers, type CustomerWithBalance } from '../../db/repo';
import { useLive } from '../../ui/hooks';
import { AmountText, EmptyState } from '../../ui/components';
import { Avatar, FilterChips, Label, ListItem, ScreenHeader, SummaryCard } from '../../ui/premium';
import { getTemplate, plural } from '../../templates/professions';
import { formatINR } from '../../core/money';
import { brand, radius, tabular } from '../../ui/theme';

type Filter = 'all' | 'owes' | 'settled';
const DAY = 86400000;
const ageDays = (c: CustomerWithBalance) => (c.oldestUnpaidAt ? Math.floor((Date.now() - c.oldestUnpaidAt) / DAY) : 0);

function subtitleFor(c: CustomerWithBalance) {
  if (c.balancePaise > 0) {
    const d = ageDays(c);
    return d >= 1 ? `Owes for ${d} day${d === 1 ? '' : 's'}${c.area ? ' · ' + c.area : ''}` : `Owes you${c.area ? ' · ' + c.area : ''}`;
  }
  if (c.balancePaise < 0) return `${formatINR(-c.balancePaise)} paid in advance`;
  return c.area ?? c.phone ?? 'All settled';
}

export default function Customers() {
  const ws = useLive(() => getWorkspace(), []);
  const word = getTemplate(ws?.template).customerWord;
  const list = useLive(() => listCustomers(), []);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const owing = list.filter((c) => c.balancePaise > 0);
  const pending = owing.reduce((s, c) => s + c.balancePaise, 0);
  const overdue = owing.filter((c) => ageDays(c) > 15);
  const shown = list
    .filter((c) => (filter === 'owes' ? c.balancePaise > 0 : filter === 'settled' ? c.balancePaise <= 0 : true))
    .filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()) || (c.phone ?? '').includes(q.trim()));

  return (
    <View style={{ flex: 1, backgroundColor: brand.bg }}>
      <ScreenHeader title={plural(word)} subtitle={`${list.length} ${list.length === 1 ? word.toLowerCase() : plural(word).toLowerCase()}`}
        action={isOperator() ? undefined : 'Add'} onAction={isOperator() ? undefined : () => router.push('/customer/new')} />
      <FlatList
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        data={shown}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 14, marginBottom: 14 }}>
            {list.length > 0 ? (
              <SummaryCard onPress={() => router.push('/to-collect')}>
                <Label dark>To collect</Label>
                <Text style={[tabular, { color: '#fff', fontSize: 32, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 }]} numberOfLines={1} adjustsFontSizeToFit>
                  {formatINR(pending)}
                </Text>
                <Text style={{ color: brand.onDarkMuted, marginTop: 4 }}>
                  {owing.length === 0 ? 'Nobody owes you right now' : `${owing.length} owe you${overdue.length ? ` · ${overdue.length} for more than 15 days` : ''}`}
                </Text>
              </SummaryCard>
            ) : null}
            {list.length > 0 ? (
              <>
                <Searchbar placeholder={`Search by name or phone`} value={q} onChangeText={setQ}
                  style={{ backgroundColor: brand.surface, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: brand.line, elevation: 0 }} inputStyle={{ minHeight: 0 }} />
                <FilterChips<Filter> value={filter} onChange={setFilter} options={[
                  { value: 'all', label: 'All', count: list.length },
                  { value: 'owes', label: 'Owe you', count: owing.length },
                  { value: 'settled', label: 'Settled', count: list.length - owing.length },
                ]} />
              </>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          list.length === 0
            ? <EmptyState icon="account-plus-outline" text={`No ${plural(word).toLowerCase()} yet. Add one from your contacts.`} action={`Add ${word.toLowerCase()}`} onAction={() => router.push('/customer/new')} />
            : <Text style={{ color: brand.muted, textAlign: 'center', marginTop: 24 }}>No one matches.</Text>
        }
        renderItem={({ item, index }) => (
          <View style={[styles.cell, index === 0 && styles.first, index === shown.length - 1 && styles.last]}>
            <ListItem
              left={<Avatar name={item.name} />}
              title={item.name}
              subtitle={subtitleFor(item)}
              right={
                <View style={{ alignItems: 'flex-end' }}>
                  <AmountText paise={Math.abs(item.balancePaise)} tone={item.balancePaise > 0 ? (ageDays(item) > 15 ? 'danger' : 'pending') : item.balancePaise < 0 ? 'received' : 'plain'} />
                  <Text style={{ fontSize: 11, color: brand.muted }}>{item.balancePaise > 0 ? 'due' : item.balancePaise < 0 ? 'credit' : 'settled'}</Text>
                </View>
              }
              onPress={() => router.push(`/customer/${item.id}`)}
            />
            {index < shown.length - 1 ? <View style={styles.divider} /> : null}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cell: { backgroundColor: brand.surface, borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: brand.line },
  first: { borderTopWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md, overflow: 'hidden' },
  last: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: brand.line, marginLeft: 66 },
});
