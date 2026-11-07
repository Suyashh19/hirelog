import React from 'react';
import { FlatList, Linking, View } from 'react-native';
import { Button, Card, Text } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { billLabel, getCustomer, getWorkspace, ledger, entryTotal } from '../../db/repo';
import { useLive } from '../../ui/hooks';
import { AmountText, EmptyState, Row, StatusBadge } from '../../ui/components';
import { formatDuration } from '../../core/time';
import { formatINR } from '../../core/money';
import { openWhatsApp } from '../../bills/share';
import { hasFeature } from '../../billing/plan';
import { upiUri } from '../../bills/html';

const d = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export default function CustomerLedger() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useLive(() => getCustomer(id), [id]);
  const items = useLive(() => ledger(id), [id]);
  if (!c) return null;

  const remind = () => {
    const ws = getWorkspace()!;
    const uri = upiUri(ws, c.balancePaise, 0);
    openWhatsApp(c.phone, `Hello ${c.name}, a gentle reminder: ${formatINR(c.balancePaise)} is pending with ${ws.name}.${ws.upiId ? `\nPay via UPI: ${ws.upiId}` : ''}${uri ? `\n${uri}` : ''}\nThank you!`);
  };

  return (
    <FlatList
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 100 }}
      data={items}
      keyExtractor={(i) => (i.kind === 'entry' ? i.entry.id : i.kind === 'bill' ? 'b' + i.bill.id : 'p' + i.payment.id)}
      ListHeaderComponent={
        <Card style={{ margin: 16 }}>
          <Card.Content style={{ gap: 8 }}>
            <Text variant="titleLarge">{c.name}</Text>
            <Text>Balance</Text>
            <AmountText paise={c.balancePaise} tone={c.balancePaise > 0 ? 'pending' : 'received'} style={{ fontSize: 32 }} />
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Button mode="contained" icon="cash-plus" onPress={() => router.push({ pathname: '/payment/new', params: { customerId: id } })}>Payment received</Button>
              {c.balancePaise > 0 ? <Button mode="outlined" icon="whatsapp" onPress={remind}>Remind</Button> : null}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 4, rowGap: 0 }}>
              <Button compact icon="pencil-outline" onPress={() => router.push({ pathname: '/customer/new', params: { id } })}>Edit</Button>
              <Button compact icon="tag-outline" onPress={() => (hasFeature('rate-overrides') ? router.push({ pathname: '/customer/rate', params: { customerId: id } }) : router.push({ pathname: '/paywall', params: { trigger: 'rate-overrides' } }))}>Special rate</Button>
              {c.phone ? <Button compact icon="phone" onPress={() => Linking.openURL(`tel:${c.phone}`)}>Call</Button> : null}
              {c.phone ? <Button compact icon="whatsapp" onPress={() => openWhatsApp(c.phone, '')}>WhatsApp</Button> : null}
            </View>
            {c.openingBalancePaise ? <Text variant="bodySmall">Includes old balance {formatINR(c.openingBalancePaise)}</Text> : null}
          </Card.Content>
        </Card>
      }
      ListEmptyComponent={<EmptyState text="Nothing here yet — log time for this customer from Home." />}
      renderItem={({ item }) => {
        if (item.kind === 'entry') {
          const e = item.entry;
          return <Row icon="timer-outline" title={`${e.resourceName}${e.note ? ' · ' + e.note : ''}`}
            subtitle={`${d(e.startedAt)} · ${e.unit === 'hour' ? formatDuration(e.billableSeconds) : `${e.quantity ?? 1} ${e.unit}`}${e.status === 'billed' ? ' · Billed' : ''}`}
            right={<AmountText paise={entryTotal(e)} />} onPress={() => router.push(`/entry/${e.id}`)} />;
        }
        if (item.kind === 'bill') {
          const b = item.bill;
          return <Row icon="file-document-outline" title={`${b.taxPaise ? 'Tax invoice' : 'Bill'} ${billLabel(getWorkspace(), b.number)}`} subtitle={d(b.updatedAt)}
            right={<View style={{ alignItems: 'flex-end' }}><AmountText paise={b.subtotalPaise + (b.taxPaise ?? 0)} /><StatusBadge status={b.status} /></View>}
            onPress={() => router.push(`/bill/${b.id}`)} />;
        }
        const p = item.payment;
        return <Row icon="cash" title={`Payment · ${p.method.toUpperCase()}`} subtitle={`${d(p.receivedAt)}${p.note ? ' · ' + p.note : ''}`}
          right={<AmountText paise={-p.amountPaise} tone="received" />} />;
      }}
    />
  );
}
