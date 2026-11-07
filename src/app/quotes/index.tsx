import React from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { router } from 'expo-router';
import { listQuotes, type QuoteStatus } from '../../data/quotes';
import { useLive } from '../../ui/hooks';
import { AmountText, EmptyState } from '../../ui/components';
import { ListGroup, ListItem, ProBadge } from '../../ui/premium';
import { hasFeature } from '../../billing/plan';
import { brand } from '../../ui/theme';

const STATUS: Record<QuoteStatus, { text: string; color: string }> = {
  draft: { text: 'Draft', color: brand.muted }, sent: { text: 'Sent', color: brand.pending },
  accepted: { text: 'Accepted', color: brand.money }, declined: { text: 'Declined', color: brand.danger },
  converted: { text: 'Turned into a job', color: brand.primary },
};

export default function Quotes() {
  const quotes = useLive(() => listQuotes(), []);
  const add = () => (hasFeature('quotes') ? router.push('/quotes/new') : router.push({ pathname: '/paywall', params: { trigger: 'quotes' } }));
  return (
    <View style={{ flex: 1, backgroundColor: brand.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 14 }}>
        <Button mode="contained" icon="plus" onPress={add} contentStyle={{ minHeight: 50 }}>New quote</Button>
        {!hasFeature('quotes') ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ProBadge small /><Text style={{ color: brand.muted }}>Quotes are part of Pro.</Text>
          </View>
        ) : null}
        {quotes.length === 0 ? (
          <EmptyState icon="file-document-edit-outline" text="No quotes yet. Send one before a big job, and turn it into a bill when they agree." action="New quote" onAction={add} />
        ) : (
          <ListGroup>
            {quotes.map((q) => (
              <ListItem key={q.id} icon="file-document-edit-outline" title={`Q-${q.number} · ${q.customerName ?? 'No customer'}`}
                subtitle={STATUS[q.status].text}
                right={<View style={{ alignItems: 'flex-end' }}><AmountText paise={q.totalPaise} /><Text style={{ fontSize: 11, color: STATUS[q.status].color, fontWeight: '700' }}>{STATUS[q.status].text}</Text></View>}
                onPress={() => router.push(`/quotes/${q.id}`)} />
            ))}
          </ListGroup>
        )}
      </ScrollView>
    </View>
  );
}
