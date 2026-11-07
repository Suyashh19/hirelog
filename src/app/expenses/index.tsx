import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { router } from 'expo-router';
import { EXPENSE_CATEGORIES, deleteExpense, expenseTotal, listExpenses } from '../../data/expenses';
import { useLive } from '../../ui/hooks';
import { AmountText, EmptyState, UndoSnackbar } from '../../ui/components';
import { Label, ListGroup, ListItem, ProBadge, Segmented, SummaryCard } from '../../ui/premium';
import { hasFeature } from '../../billing/plan';
import { formatMoney } from '../../core/money';
import { brand, tabular } from '../../ui/theme';
import { restore } from '../../db/repo';

type Kind = 'month' | 'last';
const range = (k: Kind) => {
  const d = new Date();
  const off = k === 'last' ? -1 : 0;
  return { from: new Date(d.getFullYear(), d.getMonth() + off, 1).getTime(), to: new Date(d.getFullYear(), d.getMonth() + off + 1, 1).getTime() };
};

export default function Expenses() {
  const [kind, setKind] = useState<Kind>('month');
  const r = range(kind);
  const rows = useLive(() => listExpenses(r.from, r.to), [r.from, r.to]);
  const total = useLive(() => expenseTotal(r.from, r.to), [r.from, r.to]);
  const [undo, setUndo] = useState<string | null>(null);
  const add = () => (hasFeature('expenses') ? router.push('/expenses/new') : router.push({ pathname: '/paywall', params: { trigger: 'expenses' } }));
  const cat = (id: string) => EXPENSE_CATEGORIES.find((c) => c.id === id) ?? EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];

  return (
    <View style={{ flex: 1, backgroundColor: brand.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
        <Segmented<Kind> value={kind} onChange={setKind} options={[{ value: 'month', label: 'This month' }, { value: 'last', label: 'Last month' }]} />
        <SummaryCard>
          <Label dark>Spent</Label>
          <Text style={[tabular, { color: '#fff', fontSize: 32, fontWeight: '800' }]}>{formatMoney(total)}</Text>
          <Text style={{ color: brand.onDarkMuted }}>Profit per machine is in Reports</Text>
        </SummaryCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Button mode="contained" icon="plus" onPress={add} style={{ flex: 1 }} contentStyle={{ minHeight: 48 }}>Add expense</Button>
          {!hasFeature('expenses') ? <ProBadge small /> : null}
        </View>
        {rows.length === 0 ? (
          <EmptyState icon="receipt" text="No expenses in this month. Add fuel, repairs or driver pay to see your real profit." />
        ) : (
          <ListGroup>
            {rows.map((x) => (
              <ListItem key={x.id} icon={cat(x.category).icon} title={`${cat(x.category).label}${x.resourceName ? ' · ' + x.resourceName : ''}`}
                subtitle={`${new Date(x.spentAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}${x.litres ? ` · ${x.litres} L` : ''}${x.note ? ' · ' + x.note : ''}`}
                right={<AmountText paise={x.amountPaise} tone="danger" />}
                onPress={() => { deleteExpense(x.id); setUndo(x.id); }} />
            ))}
          </ListGroup>
        )}
        {rows.length ? <Text style={{ color: brand.muted, fontSize: 12, textAlign: 'center' }}>Tap an expense to delete it.</Text> : null}
      </ScrollView>
      <UndoSnackbar visible={!!undo} message="Expense deleted" onUndo={() => { if (undo) restore('expenses', undo); setUndo(null); }} onDismiss={() => setUndo(null)} />
    </View>
  );
}
