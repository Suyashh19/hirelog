import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { router } from 'expo-router';
import { listResources } from '../../db/repo';
import { EXPENSE_CATEGORIES, addExpense, type ExpenseCategory } from '../../data/expenses';
import { useLive } from '../../ui/hooks';
import { Picker } from '../../ui/components';
import { parseMoney } from '../../core/money';
import { currencySymbol } from '../../core/region';
import { brand } from '../../ui/theme';
import { haptic } from '../../ui/haptics';

const dayStart = (offset: number) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset, 12).getTime(); };

export default function NewExpense() {
  const resources = useLive(() => listResources(), []);
  const [cat, setCat] = useState<ExpenseCategory>('fuel');
  const [resId, setResId] = useState<string | null>(resources.length === 1 ? resources[0].id : null);
  const [amount, setAmount] = useState('');
  const [litres, setLitres] = useState('');
  const [note, setNote] = useState('');
  const [day, setDay] = useState(0);
  const p = parseMoney(amount);

  const save = () => {
    if (!p) return;
    addExpense({ resourceId: resId, category: cat, amountPaise: p, spentAt: day === 0 ? Date.now() : dayStart(day), litres: cat === 'fuel' ? parseFloat(litres) || null : null, note: note || null });
    haptic.success();
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      <Text variant="titleSmall">What was it for?</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {EXPENSE_CATEGORIES.map((c) => (
          <Button key={c.id} compact icon={c.icon} mode={cat === c.id ? 'contained' : 'outlined'} onPress={() => setCat(c.id)}>{c.label}</Button>
        ))}
      </View>
      <TextInput mode="outlined" label={`Amount ${currencySymbol()}`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" autoFocus />
      {cat === 'fuel' ? <TextInput mode="outlined" label="Litres (optional)" value={litres} onChangeText={setLitres} keyboardType="decimal-pad" /> : null}
      <Text variant="titleSmall">Which machine, vehicle or service?</Text>
      <Picker items={[{ id: '', name: 'General' } as any, ...resources]} selected={resId ?? ''} onSelect={(v) => setResId(v || null)} label={(r: any) => r.name} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[[0, 'Today'], [-1, 'Yesterday'], [-2, '2 days ago']].map(([o, l]) => (
          <Button key={String(o)} compact mode={day === o ? 'contained' : 'outlined'} onPress={() => setDay(o as number)}>{l as string}</Button>
        ))}
      </View>
      <TextInput mode="outlined" label="Note (optional)" value={note} onChangeText={setNote} />
      <Text style={{ color: brand.muted, fontSize: 13 }}>Expenses are your costs. They are never put on a customer&apos;s bill — use Materials for that.</Text>
      <Button mode="contained" disabled={!p} onPress={save} contentStyle={{ minHeight: 56 }}>Save expense</Button>
    </ScrollView>
  );
}
