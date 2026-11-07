import React, { useState } from 'react';
import { currencySymbol } from '../core/region';
import { ScrollView, View } from 'react-native';
import { Button, Dialog, Portal, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { router } from 'expo-router';
import { archiveResource, hasRunning, addResource, deleteRate, getWorkspace, holidayCalendar, listRates, listResources, saveRate, usesMeter } from '../db/repo';
import { getTemplate } from '../templates/professions';
import { isOperator } from '../data/membership';
import { useLive } from '../ui/hooks';
import { AmountText, EmptyState, Row } from '../ui/components';
import { MEASURES_FOR, MEASURE_TEXT, RATE_UNITS, UNIT_LABEL, defaultMeasure, measureOf, type Measure, type RateUnit } from '../core/rate';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tap } from '../ui/components';
import { radius } from '../ui/theme';
import { formatINR, parseRupees } from '../core/money';
import { parseClock } from '../core/time';
import { checkCanAdd, hasFeature } from '../billing/plan';
import { brand } from '../ui/theme';

const p2 = (n: number) => n.toString().padStart(2, '0');
const clockText = (min: number) => `${p2(Math.floor(min / 60))}:${p2(min % 60)}`;

const FREE_VARIANTS_PER_RESOURCE = 3; // RS-3: Free 3, Pro unlimited

/** RS-1..RS-5. Several prices for one resource are "variants"; rate rules and overtime are Pro. */
export default function Resources() {
  const resources = useLive(() => listResources(), []);
  const rates = useLive(() => listRates(), []);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ resourceId: string; id?: string } | null>(null);
  const [unit, setUnit] = useState<RateUnit>('hour');
  const [amount, setAmount] = useState('');
  const [variant, setVariant] = useState('');
  const [visit, setVisit] = useState('');
  const [minMin, setMinMin] = useState('');
  const [round, setRound] = useState('0');
  const [otHours, setOtHours] = useState('');
  const [otRate, setOtRate] = useState('');
  const [nightRate, setNightRate] = useState('');
  const [nightFrom, setNightFrom] = useState('22:00');
  const [nightTo, setNightTo] = useState('06:00');
  const [holRate, setHolRate] = useState('');
  const [minQty, setMinQty] = useState('');
  const [measure, setMeasure] = useState<Measure>('timer');
  const [hireFee, setHireFee] = useState('');
  const [hireHours, setHireHours] = useState('');
  const tplId = getWorkspace()?.template;
  const [newKind, setNewKind] = useState<'machine' | 'self'>(getTemplate(tplId).resourceKind);
  const [formErr, setFormErr] = useState<string | null>(null);
  const cal = useLive(() => holidayCalendar(), []);
  const holidaysSet = cal.weekdays.length > 0 || cal.dates.length > 0;

  const paywall = (trigger: string) => { setEdit(null); router.push({ pathname: '/paywall', params: { trigger } }); };

  const add = () => {
    const ws = getWorkspace();
    if (!ws || !name.trim()) return;
    const blocked = checkCanAdd('resource');
    if (blocked) { router.push({ pathname: '/paywall', params: { trigger: blocked.trigger } }); return; }
    addResource(ws.id, name.trim(), newKind);
    setName('');
  };

  const saveR = () => {
    const ws = getWorkspace();
    const p = parseRupees(amount);
    if (!ws || !edit || !p) return;
    const hourly = unit === 'hour';
    const otAfter = hourly && otHours ? Math.round(parseFloat(otHours) * 3600) : 0;
    const nightP = hourly ? parseRupees(nightRate) ?? 0 : 0;
    const holP = hourly ? parseRupees(holRate) ?? 0 : 0;
    const nFrom = parseClock(nightFrom);
    const nTo = parseClock(nightTo);
    if (nightP > 0 && (nFrom === null || nTo === null || nFrom === nTo)) {
      setFormErr('Night hours: enter a start and end time, for example 22:00 and 06:00.');
      return;
    }
    const minQ = !hourly ? parseFloat(minQty) || 0 : 0;
    const usesRules = (parseRupees(visit) ?? 0) > 0 || (parseInt(minMin || '0', 10) || 0) > 0 || (parseInt(round, 10) || 0) > 0 || otAfter > 0
      || nightP > 0 || holP > 0 || minQ > 0 || (hourly && (parseRupees(hireFee) ?? 0) > 0);
    if (!hasFeature('rate-rules') && usesRules) return paywall('rate-rules');

    // Free plan: at most 3 named variants per resource
    const v = variant.trim() || null;
    if (v && !hasFeature('multi-device')) {
      const existing = rates.filter((x) => x.resourceId === edit.resourceId && !x.customerId && x.variantName && x.id !== edit.id);
      const names = new Set(existing.map((x) => x.variantName));
      if (!names.has(v) && names.size >= FREE_VARIANTS_PER_RESOURCE) return paywall('variants');
    }

    saveRate(ws.id, {
      id: edit.id, resourceId: edit.resourceId, unit, amountPaise: p, variantName: v,
      visitChargePaise: parseRupees(visit) ?? 0, minSeconds: (parseInt(minMin || '0', 10) || 0) * 60,
      roundingSeconds: (parseInt(round, 10) || 0) * 60,
      overtimeAfterSeconds: otAfter > 0 ? otAfter : null,
      overtimeAmountPaise: otAfter > 0 ? (parseRupees(otRate) ?? p) : null,
      nightAmountPaise: nightP > 0 ? nightP : null,
      nightFromMin: nightP > 0 ? nFrom : null,
      nightToMin: nightP > 0 ? nTo : null,
      holidayAmountPaise: holP > 0 ? holP : null,
      minQuantity: minQ > 0 ? minQ : null,
      measure: MEASURES_FOR[unit].includes(measure) ? measure : defaultMeasure(unit),
      monthlyFeePaise: hourly && (parseRupees(hireFee) ?? 0) > 0 ? parseRupees(hireFee) : null,
      includedHours: hourly && (parseRupees(hireFee) ?? 0) > 0 ? parseFloat(hireHours) || 0 : null,
    });
    setEdit(null);
  };

  const open = (resourceId: string, r?: ReturnType<typeof listRates>[number]) => {
    setEdit({ resourceId, id: r?.id });
    setUnit(r?.unit ?? 'hour'); setAmount(r ? String(r.amountPaise / 100) : ''); setVariant(r?.variantName ?? '');
    setVisit(r?.visitChargePaise ? String(r.visitChargePaise / 100) : ''); setMinMin(r?.minSeconds ? String(r.minSeconds / 60) : '');
    setRound(String((r?.roundingSeconds ?? 0) / 60));
    setOtHours(r?.overtimeAfterSeconds ? String(r.overtimeAfterSeconds / 3600) : '');
    setOtRate(r?.overtimeAmountPaise ? String(r.overtimeAmountPaise / 100) : '');
    setNightRate(r?.nightAmountPaise ? String(r.nightAmountPaise / 100) : '');
    setNightFrom(clockText(r?.nightFromMin ?? 22 * 60));
    setNightTo(clockText(r?.nightToMin ?? 6 * 60));
    setHolRate(r?.holidayAmountPaise ? String(r.holidayAmountPaise / 100) : '');
    setMinQty(r?.minQuantity ? String(r.minQuantity) : '');
    setMeasure(r ? measureOf(r) : 'timer');
    setHireFee(r?.monthlyFeePaise ? String(r.monthlyFeePaise / 100) : '');
    setHireHours(r?.includedHours ? String(r.includedHours) : '');
    setFormErr(null);
  };

  const describe = (x: ReturnType<typeof listRates>[number]) => [
    x.visitChargePaise ? 'visit charge' : '',
    x.minSeconds ? `min ${x.minSeconds / 60} min` : '',
    x.roundingSeconds ? `rounds to ${x.roundingSeconds / 60} min` : '',
    x.overtimeAfterSeconds ? `overtime after ${x.overtimeAfterSeconds / 3600} h` : '',
    x.nightAmountPaise && x.nightFromMin != null && x.nightToMin != null
      ? `night ${clockText(x.nightFromMin)}–${clockText(x.nightToMin)} ${formatINR(x.nightAmountPaise)}/h` : '',
    x.holidayAmountPaise ? `holiday ${formatINR(x.holidayAmountPaise)}/h` : '',
    x.minQuantity ? `min ${x.minQuantity} ${UNIT_LABEL[x.unit].many}` : '',
    MEASURE_TEXT[measureOf(x)].title.toLowerCase(),
    x.monthlyFeePaise ? `monthly hire ${formatINR(x.monthlyFeePaise)} incl. ${x.includedHours ?? 0} h` : '',
  ].filter(Boolean).join(' · ') || undefined;

  if (isOperator()) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
        <Text style={{ color: brand.muted }}>Prices are set by the owner. You can log work on these:</Text>
        {resources.map((r) => <Row key={r.id} icon={usesMeter(r) ? 'excavator' : 'toolbox'} title={r.name} />)}
      </ScrollView>
    );
  }
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      <Text style={{ margin: 16, color: brand.muted }}>
        Each service, machine or vehicle can have several prices, for example &quot;AC repair&quot; and &quot;Wiring&quot;, or &quot;Per km&quot; and &quot;Per day&quot;. Tap Add price to add one.
      </Text>
      {msg ? <Text style={{ color: brand.danger, marginHorizontal: 16, marginBottom: 8 }}>{msg}</Text> : null}
      {resources.length === 0 ? <EmptyState text="Nothing to charge for yet — add a service, machine or vehicle below." /> : null}
      {resources.map((r) => (
        <View key={r.id}>
          <Row icon={usesMeter(r) ? 'excavator' : 'toolbox'} title={r.name}
            subtitle={usesMeter(r) ? `Hour meter: ${r.meterReading ?? 'not set yet'}` : undefined} right={
            <View style={{ flexDirection: 'row' }}>
              <Button compact onPress={() => open(r.id)}>Add price</Button>
              <Button compact textColor={brand.danger} onPress={() => (hasRunning(r.id) ? setMsg('Stop the running timer first.') : archiveResource(r.id))}>Remove</Button>
            </View>} />
          {rates.filter((x) => x.resourceId === r.id && !x.customerId).map((x) => (
            <Row key={x.id} title={`${x.variantName ?? 'Standard'} · per ${x.unit}`} subtitle={describe(x)}
              right={<AmountText paise={x.amountPaise} />} onPress={() => open(r.id, x)} />
          ))}
        </View>
      ))}
      <View style={{ padding: 16, gap: 8 }}>
        <TextInput mode="outlined" label="New service, machine or vehicle" value={name} onChangeText={setName} />
        {getTemplate(tplId).id === 'equipment' ? (
          <SegmentedButtons value={newKind} onValueChange={(v) => setNewKind(v as 'machine' | 'self')} buttons={[
            { value: 'machine', label: 'Machine (hour meter)', icon: 'excavator' },
            { value: 'self', label: 'Vehicle / other', icon: 'car' },
          ]} />
        ) : null}
        <Button mode="contained" icon="plus" onPress={add} disabled={!name.trim()}>Add</Button>
      </View>
      <Portal>
        <Dialog visible={!!edit} onDismiss={() => setEdit(null)} style={{ backgroundColor: '#fff' }}>
          <Dialog.Title>Price</Dialog.Title>
          <Dialog.ScrollArea style={{ maxHeight: 440 }}>
            <ScrollView contentContainerStyle={{ gap: 10, paddingVertical: 8 }} keyboardShouldPersistTaps="handled">
              <Text>You charge per</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {RATE_UNITS.map((u) => <Button key={u} compact mode={unit === u ? 'contained' : 'outlined'} onPress={() => setUnit(u)}>{u}</Button>)}
              </View>
              <TextInput mode="outlined" label={`Price ${currencySymbol()} per ${UNIT_LABEL[unit].one}`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
              <TextInput mode="outlined" label='Name (optional, e.g. "AC repair")' value={variant} onChangeText={setVariant} />
              <TextInput mode="outlined" label={`Visit charge ${currencySymbol()}`} value={visit} onChangeText={setVisit} keyboardType="decimal-pad" />
              {MEASURES_FOR[unit].length > 1 ? (
                <>
                  <Text>How is it measured?</Text>
                  {MEASURES_FOR[unit].map((m) => {
                    const on = (MEASURES_FOR[unit].includes(measure) ? measure : defaultMeasure(unit)) === m;
                    return (
                      <Tap key={m} onPress={() => setMeasure(m)} label={MEASURE_TEXT[m].title}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, borderWidth: 1.5, borderColor: on ? brand.primary : brand.line, padding: 10 }}>
                          <MaterialCommunityIcons name={MEASURE_TEXT[m].icon as any} size={20} color={on ? brand.primary : brand.muted} />
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={{ fontWeight: '700', color: brand.ink }}>{MEASURE_TEXT[m].title}</Text>
                            <Text style={{ fontSize: 12, color: brand.muted }}>{MEASURE_TEXT[m].body}</Text>
                          </View>
                          <MaterialCommunityIcons name={on ? 'radiobox-marked' : 'radiobox-blank'} size={20} color={on ? brand.primary : '#C9C4B7'} />
                        </View>
                      </Tap>
                    );
                  })}
                </>
              ) : (
                <Text style={{ color: brand.muted, fontSize: 13 }}>No timer: you type how many {UNIT_LABEL[unit].many} after the work.</Text>
              )}
              {unit !== 'hour' ? (
                <TextInput mode="outlined" label={`Minimum ${UNIT_LABEL[unit].many} billed (optional)`} value={minQty} onChangeText={setMinQty} keyboardType="decimal-pad" />
              ) : null}
              {unit === 'hour' ? (
                <>
                  <TextInput mode="outlined" label="Minimum billable minutes" value={minMin} onChangeText={setMinMin} keyboardType="number-pad" />
                  <Text>Round up to</Text>
                  <SegmentedButtons value={round} onValueChange={setRound} buttons={['0', '5', '15', '30', '60'].map((v) => ({ value: v, label: v === '0' ? 'None' : `${v}m` }))} />
                  <Text style={{ marginTop: 6 }}>Overtime</Text>
                  <TextInput mode="outlined" label="Overtime starts after (hours)" value={otHours} onChangeText={setOtHours} keyboardType="decimal-pad" />
                  {otHours ? <TextInput mode="outlined" label={`Overtime rate ${currencySymbol()} per hour`} value={otRate} onChangeText={setOtRate} keyboardType="decimal-pad" /> : null}
                  <Text style={{ marginTop: 6 }}>Monthly hire (optional)</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput style={{ flex: 1 }} mode="outlined" label={`Fee per month ${currencySymbol()}`} value={hireFee} onChangeText={setHireFee} keyboardType="decimal-pad" />
                    <TextInput style={{ flex: 1 }} mode="outlined" label="Hours included" value={hireHours} onChangeText={setHireHours} keyboardType="decimal-pad" />
                  </View>
                  {hireFee ? (
                    <Text style={{ color: brand.muted, fontSize: 13 }}>
                      Each bill charges the fee once, plus every hour above {hireHours || 0} at the price per hour above. Use one bill per month.
                    </Text>
                  ) : null}
                  <Text style={{ marginTop: 6 }}>Night rate</Text>
                  <TextInput mode="outlined" label={`Night rate ${currencySymbol()} per hour (optional)`} value={nightRate} onChangeText={setNightRate} keyboardType="decimal-pad" />
                  {nightRate ? (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TextInput style={{ flex: 1 }} mode="outlined" label="Night starts" value={nightFrom} onChangeText={setNightFrom} placeholder="22:00" />
                      <TextInput style={{ flex: 1 }} mode="outlined" label="Night ends" value={nightTo} onChangeText={setNightTo} placeholder="06:00" />
                    </View>
                  ) : null}
                  <Text style={{ marginTop: 6 }}>Holiday rate</Text>
                  <TextInput mode="outlined" label={`Holiday rate ${currencySymbol()} per hour (optional)`} value={holRate} onChangeText={setHolRate} keyboardType="decimal-pad" />
                  {holRate && !holidaysSet ? (
                    <Text style={{ color: brand.muted }}>
                      Choose your holidays in More → Business profile. Until then this rate is not used.
                    </Text>
                  ) : null}
                  {formErr ? <Text style={{ color: brand.danger }}>{formErr}</Text> : null}
                </>
              ) : null}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            {edit?.id ? <Button textColor={brand.danger} onPress={() => { deleteRate(edit.id!); setEdit(null); }}>Delete</Button> : null}
            <Button onPress={() => setEdit(null)}>Cancel</Button>
            <Button mode="contained" onPress={saveR} disabled={!parseRupees(amount)}>Save</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  );
}
