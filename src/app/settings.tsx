import React, { useState } from 'react';
import { Alert, Image, ScrollView, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { router } from 'expo-router';
import { getWorkspace, holidayCalendar, updateWorkspace } from '../db/repo';
import { clearLogo, getLogo, pickLogo } from '../bills/logo';
import { hasFeature } from '../billing/plan';
import { formatHolidayDates, parseHolidayDates } from '../core/rate';
import { GST_RATES, cleanGstin } from '../core/gst';
import { COUNTRY_LIST, REGIONS, type CountryCode } from '../core/region';
import { LANGS, type Lang } from '../i18n';
import { ProBadge } from '../ui/premium';
import { useLive } from '../ui/hooks';
import { brand } from '../ui/theme';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const RATES_ABROAD = [0, 5, 10, 12.5, 15, 20, 23];

export default function Settings() {
  const ws = getWorkspace()!;
  const logo = useLive(() => getLogo(), []);
  const [name, setName] = useState(ws.name);
  const [phone, setPhone] = useState(ws.phone ?? '');
  const [address, setAddress] = useState(ws.address ?? '');
  const [country, setCountry] = useState<CountryCode>((ws.country as CountryCode) ?? 'IN');
  const reg = REGIONS[country] ?? REGIONS.IN;
  const [lang, setLangSel] = useState<Lang>(ws.lang === 'hi' ? 'hi' : 'en');
  const [dist, setDist] = useState<'km' | 'mi'>((ws.distanceUnit as 'km' | 'mi') ?? reg.distance);
  const [upi, setUpi] = useState(ws.upiId ?? '');
  const [payLink, setPayLink] = useState(ws.payLink ?? '');
  const cal0 = holidayCalendar(ws);
  const [offDays, setOffDays] = useState<number[]>(cal0.weekdays);
  const [dates, setDates] = useState(formatHolidayDates(cal0.dates));
  const parsedDates = parseHolidayDates(dates);
  const toggleDay = (d: number) => setOffDays((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d].sort()));
  const gstAllowed = hasFeature('gst');
  const [gstin, setGstin] = useState(ws.gstin ?? '');
  const [gstRate, setGstRate] = useState(ws.gstRate ?? reg.defaultTaxRate);
  const [prefix, setPrefix] = useState(ws.invoicePrefix ?? '');
  const [terms, setTerms] = useState<number | null>(ws.paymentTermsDays ?? null);
  const [remind, setRemind] = useState<string>(ws.reminderDays ?? '3,7,15');
  const gstOk = !gstin.trim() || !reg.splitTax || !!cleanGstin(gstin);
  const taxIdSet = reg.splitTax ? !!cleanGstin(gstin) : !!gstin.trim();
  const linkOk = !payLink.trim() || /^https?:\/\/\S+$/i.test(payLink.trim());

  const addLogo = async () => {
    if (!hasFeature('remove-footer')) { router.push({ pathname: '/paywall', params: { trigger: 'footer' } }); return; }
    const r = await pickLogo();
    if (!r.ok && r.message) Alert.alert('Could not add the logo', r.message);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      <TextInput mode="outlined" label="Business name" value={name} onChangeText={setName} />
      <TextInput mode="outlined" label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <TextInput mode="outlined" label="Address" value={address} onChangeText={setAddress} multiline />

      <Text variant="titleMedium" style={{ marginTop: 8 }}>Country and language</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {COUNTRY_LIST.map((c) => (
          <Button key={c} compact mode={country === c ? 'contained' : 'outlined'}
            onPress={() => { setCountry(c); setDist(REGIONS[c].distance); setGstRate(REGIONS[c].defaultTaxRate); }}>{REGIONS[c].name}</Button>
        ))}
      </View>
      <Text style={{ color: brand.muted, fontSize: 13 }}>Money in {reg.currency} ({reg.symbol.trim()}) · tax called {reg.taxName}</Text>
      <Text>Distance</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {(['km', 'mi'] as const).map((d) => (
          <Button key={d} compact mode={dist === d ? 'contained' : 'outlined'} onPress={() => setDist(d)}>{d === 'km' ? 'Kilometres' : 'Miles'}</Button>
        ))}
      </View>
      <Text>App language</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {LANGS.map((l) => (
          <Button key={l.id} compact mode={lang === l.id ? 'contained' : 'outlined'} onPress={() => setLangSel(l.id)}>{l.name}</Button>
        ))}
      </View>

      <Text variant="titleMedium" style={{ marginTop: 8 }}>How customers pay you</Text>
      {reg.upi ? (
        <TextInput mode="outlined" label="UPI ID (adds a pay link and QR to bills)" value={upi} onChangeText={setUpi} autoCapitalize="none" />
      ) : null}
      <TextInput mode="outlined" label={reg.upi ? 'Other payment link (optional)' : 'Payment link (Stripe, PayPal, Square…)'} value={payLink}
        onChangeText={setPayLink} autoCapitalize="none" keyboardType="url" error={!linkOk} placeholder="https://…" />
      <Text style={{ color: linkOk ? brand.muted : brand.danger, fontSize: 13 }}>
        {linkOk ? (reg.upi ? 'Used when there is no UPI ID.' : 'Goes on every bill with a QR code, so customers can pay by card.') : 'The link must start with https://'}
      </Text>

      <Text variant="titleMedium" style={{ marginTop: 8 }}>Logo on your bills</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {logo ? <Image source={{ uri: logo }} style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: brand.tint }} /> : null}
        <Button mode="outlined" icon="image-plus" onPress={addLogo}>{logo ? 'Change logo' : 'Add logo (Pro)'}</Button>
        {logo ? <Button textColor={brand.danger} onPress={clearLogo}>Remove</Button> : null}
      </View>

      <Text variant="titleMedium" style={{ marginTop: 8 }}>Holidays</Text>
      <Text style={{ color: brand.muted }}>Work on these days uses the holiday price, if you set one in More → Prices.</Text>
      <Text>Weekly off days</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {DAYS.map((d, i) => (
          <Button key={d} compact mode={offDays.includes(i) ? 'contained' : 'outlined'} onPress={() => toggleDay(i)}>{d}</Button>
        ))}
      </View>
      <TextInput mode="outlined" label="Holiday dates (e.g. 26-01, 25-12, 2-11-2026)" value={dates} onChangeText={setDates} error={parsedDates === null} />
      <Text style={{ color: parsedDates === null ? brand.danger : brand.muted }}>
        {parsedDates === null
          ? 'Write each date as day-month, for example 25-12. Add a year (25-12-2027) for a one-time holiday.'
          : 'Day-month dates repeat every year. Separate dates with commas.'}
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <Text variant="titleMedium">Invoices and {reg.taxName}</Text>
        {!gstAllowed ? <ProBadge small plan="business" /> : null}
      </View>
      <Text style={{ color: brand.muted }}>Invoice numbers and payment terms apply to every new bill.</Text>
      <TextInput mode="outlined" label='Invoice number prefix (e.g. "INV-")' value={prefix} onChangeText={setPrefix} autoCapitalize="characters" />
      <Text>Payment due</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {[null, 7, 14, 15, 30].map((d) => (
          <Button key={String(d)} compact mode={terms === d ? 'contained' : 'outlined'} onPress={() => setTerms(d)}>{d === null ? 'Not shown' : `${d} days`}</Button>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text>Payment reminders</Text>
        {!hasFeature('reminders') ? <ProBadge small /> : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {[['off', 'Off'], ['3,7,15', 'Day 3, 7, 15'], ['7,15,30', 'Day 7, 15, 30']].map(([v, l]) => (
          <Button key={v} compact mode={remind === v ? 'contained' : 'outlined'} onPress={() => setRemind(v)}>{l}</Button>
        ))}
      </View>
      <Text style={{ color: brand.muted, fontSize: 13 }}>Your phone reminds you when a sent bill is still unpaid, with a polite message ready to send.</Text>
      {gstAllowed ? (
        <>
          <TextInput mode="outlined" label={`Your ${reg.taxIdLabel} (leave empty if not registered)`} value={gstin} onChangeText={setGstin}
            autoCapitalize="characters" error={!gstOk} />
          {!gstOk ? <Text style={{ color: brand.danger }}>A GSTIN has 15 characters, like 27AAPFU0939F1ZV.</Text> : null}
          {taxIdSet ? (
            <>
              <Text>{reg.taxName} rate on your work</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {(reg.splitTax ? GST_RATES : RATES_ABROAD).map((r) => (
                  <Button key={r} compact mode={gstRate === r ? 'contained' : 'outlined'} onPress={() => setGstRate(r)}>{`${r}%`}</Button>
                ))}
              </View>
              <Text style={{ color: brand.muted, fontSize: 13 }}>
                {reg.splitTax
                  ? 'New bills become tax invoices. Same state as the client (or a client without GSTIN): CGST + SGST. Different state: IGST.'
                  : `New bills become tax invoices with ${reg.taxName} at ${gstRate}% added. Check the right rate with your accountant.`}
              </Text>
            </>
          ) : null}
        </>
      ) : (
        <Button mode="outlined" icon="file-certificate-outline" onPress={() => router.push({ pathname: '/paywall', params: { trigger: 'gst' } })}>
          {reg.taxName} tax invoices (Business)
        </Button>
      )}

      <Button mode="contained" contentStyle={{ minHeight: 56 }} disabled={parsedDates === null || !gstOk || !linkOk} onPress={() => {
        updateWorkspace(ws.id, {
          name: name.trim() || ws.name, phone: phone || null, address: address || null, upiId: reg.upi ? upi || null : ws.upiId,
          country, distanceUnit: dist, lang, payLink: payLink.trim() || null,
          holidayWeekdays: offDays.length ? offDays.join(',') : null,
          holidayDates: parsedDates && parsedDates.length ? parsedDates.join(',') : null,
          invoicePrefix: prefix.trim() || null, paymentTermsDays: terms, reminderDays: remind,
          ...(gstAllowed ? { gstin: reg.splitTax ? cleanGstin(gstin) : gstin.trim() || null, gstRate } : {}),
        });
        router.back();
      }}>Save</Button>
    </ScrollView>
  );
}
