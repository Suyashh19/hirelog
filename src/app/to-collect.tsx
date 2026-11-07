import React from 'react';
import { FlatList, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { router, useFocusEffect } from 'expo-router';
import { hasFeature } from '../billing/plan';
import { getWorkspace, listCustomers } from '../db/repo';
import { useLive } from '../ui/hooks';
import { AmountText, EmptyState, Row } from '../ui/components';
import { ageBucket } from '../core/ledger';
import { formatINR } from '../core/money';
import { openWhatsApp } from '../bills/share';
import { upiUri } from '../bills/html';

// PY-2 / PY-3. (Pro-gated in Phase 2; open for now.)
export default function ToCollect() {
  useFocusEffect(React.useCallback(() => {
    if (!hasFeature('reminders')) router.replace({ pathname: '/paywall', params: { trigger: 'reminders' } });
  }, []));
  const list = useLive(() => listCustomers().filter((c) => c.balancePaise > 0), []);
  const remind = (c: (typeof list)[number]) => {
    const ws = getWorkspace()!;
    const uri = upiUri(ws, c.balancePaise, 0);
    openWhatsApp(c.phone, `Hello ${c.name}, a gentle reminder: ${formatINR(c.balancePaise)} is pending with ${ws.name}.${ws.upiId ? `\nPay via UPI: ${ws.upiId}` : ''}${uri ? `\n${uri}` : ''}\nThank you!`);
  };
  return (
    <FlatList
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 100 }}
      data={list}
      keyExtractor={(c) => c.id}
      ListEmptyComponent={<EmptyState text="Nobody owes you anything right now." />}
      renderItem={({ item }) => {
        const days = item.oldestUnpaidAt ? Math.floor((Date.now() - item.oldestUnpaidAt) / 86400000) : 0;
        return (
          <Row
            icon="account-clock" title={item.name} subtitle={`Oldest work ${days} days ago (${ageBucket(days)} days)`}
            onPress={() => router.push(`/customer/${item.id}`)}
            right={
              <View style={{ alignItems: 'flex-end' }}>
                <AmountText paise={item.balancePaise} tone={days > 30 ? 'danger' : 'pending'} />
                <Button compact icon="whatsapp" onPress={() => remind(item)}>Remind</Button>
              </View>
            }
          />
        );
      }}
    />
  );
}
