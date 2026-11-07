import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { addManualEntry, getWorkspace, listCustomers, listResources, listSites, listVariants, previewManual, readingKind } from '../../db/repo';
import { useLive } from '../../ui/hooks';
import { AmountText, Picker } from '../../ui/components';
import { ItemsEditor, draftsToItems, draftsTotal, presetsFor, type ItemDraft } from '../../ui/ItemsEditor';
import { parseDurationOrRange, formatDuration } from '../../core/time';
import { meterHours } from '../../core/gst';
import { isTimeBased, UNIT_LABEL } from '../../core/rate';
import { brand } from '../../ui/theme';
import { haptic } from '../../ui/haptics';

const dayStart = (offset: number) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset).getTime();
};

// EN-1 / EN-3 / EN-4: "9:00 to 13:30" or "4.5 hrs"; quantity units; materials; machine hour meter.
export default function NewEntry() {
  const p = useLocalSearchParams<{ resourceId?: string; customerId?: string; qty?: string; note?: string }>();
  const resources = useLive(() => listResources(), []);
  const customers = useLive(() => listCustomers(), []);
  const [resId, setResId] = useState<string | null>(p.resourceId || null);
  const [custId, setCustId] = useState<string | null>(p.customerId || null);
  const [dayOffset, setDayOffset] = useState(0);
  const [when, setWhen] = useState('');
  const [brk, setBrk] = useState('');
  const [qty, setQty] = useState(p.qty || '1');
  const [note, setNote] = useState(p.note || '');
  const [variantName, setVariantName] = useState<string | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<ItemDraft[]>([]);
  const [mStart, setMStart] = useState('');
  const [mEnd, setMEnd] = useState('');

  const [visitOnly, setVisitOnly] = useState(false);
  const rid = resId ?? resources[0]?.id ?? null;
  const res = resources.find((r) => r.id === rid);
  // the rate decides what to ask: clock time, hour meter, odometer or a count
  const baseRate = rid ? previewManual({ resourceId: rid, customerId: custId, variantName, workedSeconds: 0, breakSeconds: 0 }).rate : null;
  const reading = readingKind(res, baseRate?.unit, baseRate?.measure);
  const machine = reading === 'hourmeter';
  const odo = reading === 'odometer';
  const unitWord = baseRate ? UNIT_LABEL[baseRate.unit] : null;
  const canVisitOnly = !!baseRate && baseRate.unit === 'hour' && (baseRate.visitChargePaise ?? 0) > 0;
  const variants = useLive(() => (rid ? listVariants(rid) : []), [rid]);
  const sites = useLive(() => (custId ? listSites(custId) : []), [custId]);
  const parsed = parseDurationOrRange(when);
  const breakMin = parseInt(brk || '0', 10) || 0;
  const ms = mStart.trim() ? parseFloat(mStart) : null;
  const me = mEnd.trim() ? parseFloat(mEnd) : null;
  const mh = machine || odo ? meterHours(ms, me) : null;
  const meterBad = (machine || odo) && ms !== null && me !== null && mh === null;
  // "9:00 to 13:30" gives the real start. Without a time: today it ends now (never in the future),
  // earlier days it is placed at 9:00.
  const nowMin = Math.floor(Date.now() / 60000) * 60000;
  const workedMs = (parsed?.minutes ?? 0) * 60000;
  const startedAt = parsed?.from !== undefined
    ? dayStart(dayOffset) + parsed.from * 60000
    : dayOffset === 0 ? Math.max(dayStart(0), nowMin - workedMs) : dayStart(dayOffset) + 9 * 3600000;
  const prev = useMemo(() => {
    if (!rid) return null;
    return previewManual({
      resourceId: rid, customerId: custId, variantName, workedSeconds: (parsed?.minutes ?? 0) * 60, breakSeconds: breakMin * 60,
      quantity: parseFloat(qty) || 1, startedAt, meterStart: ms, meterEnd: me, visitOnly: canVisitOnly && visitOnly,
    });
  }, [rid, custId, variantName, parsed?.minutes, breakMin, qty, startedAt, ms, me, canVisitOnly, visitOnly]);
  const timeBased = prev?.rate ? isTimeBased(prev.rate.unit) : true;
  const itemsTotal = draftsTotal(drafts);
  const isVisit = canVisitOnly && visitOnly;
  const hasWork = isVisit || (timeBased ? (mh !== null || !!parsed) : odo && mh !== null ? true : (parseFloat(qty) || 0) > 0);
  const ready = !!rid && !!prev?.rate && !meterBad && (hasWork || itemsTotal > 0);

  const save = () => {
    const ws = getWorkspace();
    if (!ws || !rid) return;
    addManualEntry(ws.id, {
      resourceId: rid, customerId: custId, siteId, variantName, startedAt, workedSeconds: (parsed?.minutes ?? 0) * 60, breakSeconds: breakMin * 60,
      quantity: timeBased ? null : parseFloat(qty) || 1, note: note || null, items: draftsToItems(drafts),
      meterStart: mh !== null ? ms : null, meterEnd: mh !== null ? me : null, visitOnly: isVisit,
    });
    haptic.success();
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      <Text variant="titleSmall">Which day?</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {[[0, 'Today'], [-1, 'Yesterday'], [-2, '2 days ago']].map(([o, l]) => (
          <Button key={String(o)} mode={dayOffset === o ? 'contained' : 'outlined'} onPress={() => setDayOffset(o as number)}>{l as string}</Button>
        ))}
      </View>
      <Text variant="titleSmall">{res ? (machine ? 'Machine' : 'What') : 'Resource'}</Text>
      <Picker items={resources} selected={rid} onSelect={(id) => { setResId(id); setVariantName(null); setMStart(''); setMEnd(''); }} label={(r) => r.name} />

      {timeBased ? (
        machine ? (
          <>
            <Text variant="titleSmall">Hour meter</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput style={{ flex: 1 }} mode="outlined" label="Start reading" value={mStart} onChangeText={setMStart} keyboardType="decimal-pad"
                placeholder={res?.meterReading != null ? String(res.meterReading) : undefined} />
              <TextInput style={{ flex: 1 }} mode="outlined" label="End reading" value={mEnd} onChangeText={setMEnd} keyboardType="decimal-pad" error={meterBad} />
            </View>
            {res?.meterReading != null && !mStart ? (
              <Button compact mode="text" onPress={() => setMStart(String(res.meterReading))} style={{ alignSelf: 'flex-start' }}>
                Use last reading: {res.meterReading}
              </Button>
            ) : null}
            <Text style={{ color: meterBad ? brand.danger : brand.muted, fontSize: 13 }}>
              {meterBad ? 'The end reading must be higher than the start.' : mh !== null ? `${mh} hours on the meter` : 'Or leave the meter empty and type the time below.'}
            </Text>
            {mh === null ? (
              <TextInput mode="outlined" label='Time: "9:00 to 13:30" or "4.5 hrs"' value={when} onChangeText={setWhen} />
            ) : null}
          </>
        ) : (
          <>
            {canVisitOnly ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button mode={!visitOnly ? 'contained' : 'outlined'} onPress={() => setVisitOnly(false)} style={{ flex: 1 }}>Work done</Button>
                <Button mode={visitOnly ? 'contained' : 'outlined'} onPress={() => setVisitOnly(true)} style={{ flex: 1 }}>Visit only</Button>
              </View>
            ) : null}
            {isVisit ? (
              <Text style={{ color: brand.muted }}>Only the visit charge is billed (inspection, estimate, or no work possible).</Text>
            ) : (
              <>
                <TextInput mode="outlined" label='Time: "9:00 to 13:30" or "4.5 hrs"' value={when} onChangeText={setWhen} autoFocus={!canVisitOnly} />
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {['1 hr', '2 hrs', '4 hrs', '8 hrs'].map((x) => <Button key={x} compact mode="outlined" onPress={() => setWhen(x)}>{x}</Button>)}
                </View>
                <TextInput mode="outlined" label="Break (minutes)" value={brk} onChangeText={setBrk} keyboardType="number-pad" />
              </>
            )}
          </>
        )
      ) : odo ? (
        <>
          <Text variant="titleSmall">Odometer</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={{ flex: 1 }} mode="outlined" label="Start km" value={mStart} onChangeText={setMStart} keyboardType="decimal-pad" />
            <TextInput style={{ flex: 1 }} mode="outlined" label="End km" value={mEnd} onChangeText={setMEnd} keyboardType="decimal-pad" error={meterBad} />
          </View>
          {res?.meterReading != null && !mStart ? (
            <Button compact mode="text" onPress={() => setMStart(String(res.meterReading))} style={{ alignSelf: 'flex-start' }}>
              Use last reading: {res.meterReading}
            </Button>
          ) : null}
          <Text style={{ color: meterBad ? brand.danger : brand.muted, fontSize: 13 }}>
            {meterBad ? 'The end reading must be higher than the start.' : mh !== null ? `${mh} km driven` : 'Or leave the odometer empty and type the km below.'}
          </Text>
          {mh === null ? (
            <TextInput mode="outlined" label="Km driven" value={qty} onChangeText={setQty} keyboardType="decimal-pad" />
          ) : null}
        </>
      ) : (
        <TextInput mode="outlined" label={`How many ${unitWord?.many ?? 'units'}?`} value={qty} onChangeText={setQty} keyboardType="decimal-pad" />
      )}
      {baseRate?.minQuantity && !timeBased ? (
        <Text style={{ color: brand.muted, fontSize: 13 }}>Minimum {baseRate.minQuantity} {unitWord?.many} is billed.</Text>
      ) : null}

      <Text variant="titleSmall">Customer</Text>
      <Picker items={[{ id: '', name: 'None' } as any, ...customers]} selected={custId ?? ''} onSelect={(id) => { setCustId(id || null); setSiteId(null); }} label={(c: any) => c.name} />
      {variants.length > 0 ? (
        <>
          <Text variant="titleSmall">Type of work</Text>
          <Picker items={[{ id: '', name: 'Standard' } as any, ...variants.map((v) => ({ id: v, name: v }))]} selected={variantName ?? ''} onSelect={(id) => setVariantName(id || null)} label={(v: any) => v.name} />
        </>
      ) : null}
      {sites.length > 0 ? (
        <>
          <Text variant="titleSmall">Site or project</Text>
          <Picker items={[{ id: '', name: 'None' } as any, ...sites]} selected={siteId ?? ''} onSelect={(id) => setSiteId(id || null)} label={(x: any) => x.name} />
        </>
      ) : null}

      <ItemsEditor drafts={drafts} onChange={setDrafts} presets={presetsFor(baseRate?.unit, res?.kind)} />
      <TextInput mode="outlined" label="Note (optional)" value={note} onChangeText={setNote} />

      {!prev?.rate && rid ? <Text style={{ color: brand.danger }}>No price set for this yet. Add one in More → Prices.</Text> : null}
      <View style={{ alignItems: 'center', paddingVertical: 8 }}>
        {timeBased && (parsed || mh !== null) ? <Text style={{ color: brand.muted }}>{formatDuration(prev?.billableSeconds ?? 0)} billable{itemsTotal ? ' + materials' : ''}</Text> : null}
        <AmountText paise={(hasWork ? prev?.amountPaise ?? 0 : 0) + itemsTotal} style={{ fontSize: 32 }} />
      </View>
      <Button mode="contained" disabled={!ready} onPress={save} contentStyle={{ minHeight: 56 }}>Save</Button>
    </ScrollView>
  );
}
