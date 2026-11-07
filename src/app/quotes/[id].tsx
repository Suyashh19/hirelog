import React, { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { listCustomers } from '../../db/repo';
import { convertQuote, deleteQuote, getQuote, linesTotal, quoteHtml, quoteLines, quoteText, saveQuote, setQuoteStatus } from '../../data/quotes';
import { useLive } from '../../ui/hooks';
import { AmountText, Picker } from '../../ui/components';
import { ItemsEditor, draftsToItems, newDraft, type ItemDraft } from '../../ui/ItemsEditor';
import { openWhatsApp, sharePdf } from '../../bills/share';
import { getCustomer } from '../../db/repo';
import { brand } from '../../ui/theme';
import { haptic } from '../../ui/haptics';

/** New quote (id = "new") or an existing one: edit lines, send, mark accepted, turn into a job. */
export default function QuoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const existing = !isNew ? getQuote(id) : null;
  const customers = useLive(() => listCustomers(), []);
  const [custId, setCustId] = useState<string | null>(existing?.customerId ?? null);
  const [drafts, setDrafts] = useState<ItemDraft[]>(() =>
    existing ? quoteLines(existing).map((l) => ({ ...newDraft(l.description, String(l.amountPaise / 100)), qty: String(l.quantity) })) : [newDraft()]);
  const [note, setNote] = useState(existing?.note ?? '');
  const [valid, setValid] = useState<number | null>(existing ? null : 15);
  const locked = existing?.status === 'converted';
  const lines = draftsToItems(drafts);

  const store = (status?: 'sent') => saveQuote({ id: existing?.id, customerId: custId, lines, note: note || null, validDays: valid, status });

  const send = async () => {
    const qid = store('sent');
    const q = qid ? getQuote(qid) : null;
    if (!q) return;
    const phone = q.customerId ? getCustomer(q.customerId)?.phone ?? null : null;
    await openWhatsApp(phone, quoteText(q));
    router.replace(`/quotes/${q.id}`);
  };
  const pdf = async () => {
    const qid = store();
    const q = qid ? getQuote(qid) : null;
    if (q) await sharePdf(quoteHtml(q), `Quote-Q${q.number}.pdf`, `Quote Q-${q.number}`, () => setQuoteStatus(q.id, q.status === 'draft' ? 'sent' : q.status));
  };
  const toJob = () => {
    const entryId = existing ? convertQuote(existing.id) : null;
    if (!entryId) { Alert.alert('Add a service, machine or vehicle first (More → Prices).'); return; }
    haptic.success();
    router.replace(`/entry/${entryId}`);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Text style={{ fontSize: 22, fontWeight: '800', color: brand.ink }}>{existing ? `Quote Q-${existing.number}` : 'New quote'}</Text>
      {locked ? <Text style={{ color: brand.primary, fontWeight: '700' }}>This quote was turned into a job.</Text> : null}
      <Text variant="titleSmall">Customer</Text>
      <Picker items={[{ id: '', name: 'No customer yet' } as any, ...customers]} selected={custId ?? ''} onSelect={(v) => setCustId(v || null)} label={(c: any) => c.name} />
      <ItemsEditor drafts={drafts} onChange={setDrafts} title="What the quote includes" presets={['Labour', 'Materials', 'Transport', 'Machine hire']} />
      <TextInput mode="outlined" label="Note (optional, e.g. start date, what is not included)" value={note} onChangeText={setNote} multiline />
      {!existing ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <Text>Valid for</Text>
          {[7, 15, 30].map((d) => <Button key={d} compact mode={valid === d ? 'contained' : 'outlined'} onPress={() => setValid(d)}>{`${d} days`}</Button>)}
        </View>
      ) : null}
      <View style={{ alignItems: 'center', paddingVertical: 6 }}>
        <Text style={{ color: brand.muted }}>Total</Text>
        <AmountText paise={linesTotal(lines)} style={{ fontSize: 30 }} />
      </View>
      {!locked ? (
        <>
          <Button mode="contained" icon="whatsapp" disabled={!lines.length} onPress={send} contentStyle={{ minHeight: 52 }}>Send on WhatsApp</Button>
          <Button mode="outlined" icon="file-pdf-box" disabled={!lines.length} onPress={pdf}>Share as PDF</Button>
          <Button disabled={!lines.length} onPress={() => { const q = store(); if (q) router.replace(`/quotes/${q}`); }}>Save draft</Button>
        </>
      ) : null}
      {existing && !locked ? (
        <View style={{ gap: 8, marginTop: 8 }}>
          <Text variant="titleSmall">Customer&apos;s answer</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button mode="contained-tonal" icon="check" onPress={() => setQuoteStatus(existing.id, 'accepted')} style={{ flex: 1 }}>Accepted</Button>
            <Button mode="outlined" icon="close" textColor={brand.danger} onPress={() => setQuoteStatus(existing.id, 'declined')} style={{ flex: 1 }}>Declined</Button>
          </View>
          <Button mode="contained" icon="briefcase-check-outline" onPress={toJob}>Turn into a job (ready to bill)</Button>
          <Button textColor={brand.danger} icon="delete-outline" onPress={() => { deleteQuote(existing.id); router.back(); }}>Delete quote</Button>
        </View>
      ) : null}
    </ScrollView>
  );
}
