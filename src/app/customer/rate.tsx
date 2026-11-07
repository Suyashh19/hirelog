import React, { useState } from 'react';
import { currencySymbol } from '../../core/region';
import { ScrollView } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { getCustomer, getWorkspace, listRates, listResources, saveRate } from '../../db/repo';
import { useLive } from '../../ui/hooks';
import { Picker } from '../../ui/components';
import { formatINR, parseRupees } from '../../core/money';
import { UNIT_LABEL } from '../../core/rate';
import { brand } from '../../ui/theme';

/** RS-4: a different rate for one customer. Most specific rate wins when time is logged. */
export default function CustomerRate() {
  const { customerId } = useLocalSearchParams<{ customerId: string }>();
  const c = useLive(() => getCustomer(customerId), [customerId]);
  const resources = useLive(() => listResources(), []);
  const [resId, setResId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const rid = resId ?? resources[0]?.id ?? null;
  const base = listRates().find((r) => r.resourceId === rid && !r.customerId && !r.variantName);
  const p = parseRupees(amount);
  if (!c) return null;
  const save = () => {
    const ws = getWorkspace();
    if (!ws || !rid || !p || !base) return;
    const existing = listRates().find((r) => r.resourceId === rid && r.customerId === customerId && !r.variantName);
    saveRate(ws.id, { ...base, id: existing?.id, customerId, amountPaise: p });
    router.back();
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      <Text variant="titleMedium">Special rate for {c.name}</Text>
      <Text style={{ color: brand.muted }}>Applies only to {c.name}. Everyone else keeps your normal rate.</Text>
      <Picker items={resources} selected={rid} onSelect={setResId} label={(r) => r.name} />
      {base ? <Text>Normal price: {formatINR(base.amountPaise)} per {UNIT_LABEL[base.unit].one}</Text> : <Text style={{ color: brand.danger }}>Set a normal price for this first (More → Prices).</Text>}
      <TextInput mode="outlined" label={`Rate for ${c.name} (${currencySymbol()})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      <Button mode="contained" disabled={!p || !base} onPress={save} contentStyle={{ minHeight: 56 }}>Save special rate</Button>
    </ScrollView>
  );
}
