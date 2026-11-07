import React, { useState } from 'react';
import { currencySymbol } from '../../core/region';
import { ScrollView, View } from 'react-native';
import { Button, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { addPayment, getCustomer, getWorkspace } from '../../db/repo';
import { formatINR, parseRupees } from '../../core/money';
import { useLive } from '../../ui/hooks';

export default function NewPayment() {
  const { customerId } = useLocalSearchParams<{ customerId: string }>();
  const c = useLive(() => getCustomer(customerId), [customerId]);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const paise = parseRupees(amount);
  if (!c) return null;
  const save = () => {
    const ws = getWorkspace();
    if (!ws || !paise) return;
    addPayment(ws.id, { customerId, amountPaise: paise, method, note: note || null });
    router.back();
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      <Text variant="titleMedium">{c.name} owes {formatINR(Math.max(0, c.balancePaise))}</Text>
      <TextInput mode="outlined" label={`Amount received (${currencySymbol()})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" autoFocus />
      {c.balancePaise > 0 ? <Button onPress={() => setAmount(String(c.balancePaise / 100))}>Full amount</Button> : null}
      <SegmentedButtons value={method} onValueChange={setMethod} buttons={[
        { value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'bank', label: 'Bank' }, { value: 'other', label: 'Other' },
      ]} />
      <TextInput mode="outlined" label="Note (optional)" value={note} onChangeText={setNote} />
      {paise && paise > c.balancePaise ? <Text>The extra {formatINR(paise - Math.max(0, c.balancePaise))} is kept as advance credit.</Text> : null}
      <View><Button mode="contained" disabled={!paise} onPress={save} contentStyle={{ minHeight: 56 }}>Save payment</Button></View>
    </ScrollView>
  );
}
