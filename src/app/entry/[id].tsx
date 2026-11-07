import React, { useEffect, useState } from 'react';
import { currencySymbol } from '../../core/region';
import { ScrollView, View } from 'react-native';
import { Button, Card, Text, TextInput } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { addAdjustment, addItem, deleteEntry, deleteItem, editEntry, entryHistory, entryItemsFor, getEntry, getWorkspace, undeleteEntry } from '../../db/repo';
import { ItemsEditor, draftsToItems, type ItemDraft } from '../../ui/ItemsEditor';
import { ProofSection } from '../../proof/ProofSection';
import { meterHours } from '../../core/gst';
import { UNIT_LABEL } from '../../core/rate';
import { brand } from '../../ui/theme';
import { useLive } from '../../ui/hooks';
import { AmountText, SourceBadge, UndoSnackbar } from '../../ui/components';
import { formatDuration, parseDurationOrRange } from '../../core/time';
import { formatINR, parseRupees } from '../../core/money';
import { getPlan } from '../../billing/plan';
import { LIMITS } from '../../billing/plans';

const f = (ms: number) => new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// EN-5: edit with history; billed entries are locked and changes become adjustments.
export default function EntryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const e = useLive(() => getEntry(id), [id]);
  const items = useLive(() => entryItemsFor(id), [id]);
  const history = useLive(() => entryHistory(id), [id]);
  const [note, setNote] = useState('');
  const [dur, setDur] = useState('');
  const [adj, setAdj] = useState('');
  const [adjNote, setAdjNote] = useState('');
  const [deleted, setDeleted] = useState(false);
  const [drafts, setDrafts] = useState<ItemDraft[]>([]);
  const undone = React.useRef(false);
  useEffect(() => { if (e) setNote(e.note ?? ''); }, [e?.id]);
  if (!e) return null;
  const histDays = LIMITS[getPlan().plan].historyDays;
  if (histDays !== null && Date.now() - e.startedAt > histDays * 86400000) {
    return <View style={{ padding: 24, gap: 12 }}><Text variant="titleLarge">Older than {histDays} days</Text><Text>This entry is saved safely. Pro shows your full history.</Text><Button mode="contained" onPress={() => router.replace({ pathname: '/paywall', params: { trigger: 'default' } })}>See plans</Button></View>;
  }
  const locked = e.status === 'billed';

  const save = () => {
    const p = parseDurationOrRange(dur);
    editEntry(id, { note, ...(p && e.unit === 'hour' ? { workedSeconds: p.minutes * 60 + e.breakSeconds } : {}) });
    router.back();
  };
  const adjust = () => {
    const ws = getWorkspace();
    const neg = adj.trim().startsWith('-');
    const paise = parseRupees(adj.replace('-', ''));
    if (!ws || !paise) return;
    addAdjustment(ws.id, e, neg ? -paise : paise, adjNote || 'Correction');
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      <Card>
        <Card.Content style={{ gap: 4 }}>
          <Text variant="titleLarge">{e.resourceName}{e.customerName ? ` · ${e.customerName}` : ''}</Text>
          <Text>{f(e.startedAt)}{e.endedAt ? ` → ${f(e.endedAt)}` : ''}</Text>
          <Text>{e.unit === 'hour' ? `${formatDuration(e.billableSeconds)} billable` : `${e.quantity ?? 1} ${UNIT_LABEL[e.unit]?.[(e.quantity ?? 1) === 1 ? 'one' : 'many'] ?? e.unit}`}{e.breakSeconds ? ` · break ${formatDuration(e.breakSeconds)}` : ''}</Text>
          {e.meterStart != null && e.meterEnd != null ? (
            <Text>
              {e.unit === 'km' ? 'Dashboard' : 'Hours counter'} {e.meterStart} → {e.meterEnd} ({meterHours(e.meterStart, e.meterEnd)} {e.unit === 'km' ? UNIT_LABEL.km.many : 'h'})
            </Text>
          ) : null}
          <AmountText paise={e.amountPaise + e.itemsPaise} style={{ fontSize: 28 }} />
          <SourceBadge source={e.source} tamper={!!e.tamperFlag} />
          {items.map((i) => (
            <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ flex: 1 }}>+ {i.description}{i.quantity !== 1 ? ` · ${i.quantity} × ${formatINR(i.amountPaise)}` : ''}: {formatINR(Math.round(i.amountPaise * i.quantity))}</Text>
              {!locked ? <Button compact textColor={brand.danger} onPress={() => deleteItem(i.id)}>Remove</Button> : null}
            </View>
          ))}
        </Card.Content>
      </Card>

      <ProofSection e={e} />

      {!locked ? (
        <>
          <ItemsEditor drafts={drafts} onChange={setDrafts} title="Add materials or charges" />
          {draftsToItems(drafts).length ? (
            <Button mode="contained-tonal" icon="plus" onPress={() => {
              const ws = getWorkspace();
              if (!ws) return;
              for (const it of draftsToItems(drafts)) addItem(ws.id, id, it.description, it.amountPaise, it.quantity);
              setDrafts([]);
            }}>Add {draftsToItems(drafts).length} line{draftsToItems(drafts).length > 1 ? 's' : ''}</Button>
          ) : null}
        </>
      ) : null}

      {locked ? (
        <>
          <Text variant="titleMedium">This entry is on a bill and locked</Text>
          <Text>To change the amount, add an adjustment. Use a minus sign to reduce (for example -200).</Text>
          <TextInput mode="outlined" label={`Adjustment ${currencySymbol()} (e.g. 150 or -200)`} value={adj} onChangeText={setAdj} keyboardType="numbers-and-punctuation" />
          <TextInput mode="outlined" label="Reason" value={adjNote} onChangeText={setAdjNote} />
          <Button mode="contained" onPress={adjust} disabled={!parseRupees(adj.replace('-', ''))}>Add adjustment</Button>
        </>
      ) : (
        <>
          {e.unit === 'hour' && e.meterEnd == null ? <TextInput mode="outlined" label='Change time (e.g. "3 hrs" or "2h 30m")' value={dur} onChangeText={setDur} /> : null}
          <TextInput mode="outlined" label="Note" value={note} onChangeText={setNote} />
          <Button mode="contained" onPress={save}>Save changes</Button>
          <Button textColor="#C62828" icon="delete" onPress={() => { undone.current = false; deleteEntry(id); setDeleted(true); }}>Delete</Button>
        </>
      )}

      {history.length ? (
        <View style={{ gap: 4 }}>
          <Text variant="titleMedium">Edit history</Text>
          {history.map((h) => {
            const b = JSON.parse(h.before);
            return <Text key={h.id}>{f(h.at)} — was {formatINR(b.amountPaise)}, {formatDuration(b.billableSeconds)}{b.note ? `, "${b.note}"` : ''}</Text>;
          })}
        </View>
      ) : null}
      <UndoSnackbar visible={deleted} message="Entry deleted" onUndo={() => { undone.current = true; undeleteEntry(id); setDeleted(false); }} onDismiss={() => { setDeleted(false); if (!undone.current) router.back(); }} />
    </ScrollView>
  );
}
