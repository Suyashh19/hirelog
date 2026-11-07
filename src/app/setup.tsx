import React, { useMemo, useState } from 'react';
import { currencySymbol } from '../core/region';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { pickContact } from '../ui/contacts';
import { CHARGE_OPTIONS, getTemplate, type ChargeOption } from '../templates/professions';
import { addCustomer, addResource, createWorkspace, saveRate, updateWorkspace } from '../db/repo';
import { cleanGstin } from '../core/gst';
import { MEASURE_TEXT, UNIT_LABEL } from '../core/rate';
import { COUNTRY_LIST, REGIONS, guessCountry, setRegion, suggestPrice, type CountryCode } from '../core/region';
import { deviceRegionCode, t as tx } from '../i18n';
import { formatMoney, parseRupees } from '../core/money';
import { distanceWord } from '../core/region';
import { FadeIn, IconBubble, Tap } from '../ui/components';
import { brand, radius } from '../ui/theme';
import { haptic } from '../ui/haptics';

/** "Fan fitting ₹300 a km" -> "Fan fitting £35 a mile" for the chosen country. */
function localPrices(text: string) {
  return text
    .replace(/₹([\d,]+)/g, (_, n: string) => formatMoney(suggestPrice(parseInt(n.replace(/,/g, ''), 10)) * 100))
    .replace(/\bkm\b/g, distanceWord(false));
}

/**
 * Four short steps, one question each:
 * 1 business name · 2 how you charge (plain examples, no "hours" assumed) · 3 your price · 4 first customer.
 */
export default function Setup() {
  const { template, lang } = useLocalSearchParams<{ template: string; lang?: string }>();
  const t = getTemplate(template);
  const [step, setStep] = useState(0);
  const [country, setCountry] = useState<CountryCode>(() => guessCountry(null, deviceRegionCode()));
  const reg = REGIONS[country];
  useMemo(() => setRegion(country), [country]); // so suggested prices and symbols follow the chosen country
  const [payLink, setPayLink] = useState('');
  const [business, setBusiness] = useState('');
  const [phone, setPhone] = useState('');
  const [upi, setUpi] = useState('');
  const [gstin, setGstin] = useState('');
  const [rents, setRents] = useState<'machine' | 'vehicle'>('machine');
  const options = CHARGE_OPTIONS[t.id === 'equipment' ? rents : t.id] ?? CHARGE_OPTIONS.trades;
  const [optId, setOptId] = useState<string | null>(null);
  const opt: ChargeOption | undefined = options.find((o) => o.id === optId);
  const [resource, setResource] = useState('');
  const [rate, setRate] = useState('');
  const [visit, setVisit] = useState('');
  const [reading, setReading] = useState('');
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');

  const gstOk = !gstin.trim() || !reg.splitTax || !!cleanGstin(gstin);
  const ratePaise = parseRupees(rate);
  const readingVal = reading.trim() ? parseFloat(reading) : null;
  const unitWord = opt ? UNIT_LABEL[opt.unit] : null;

  const choose = (o: ChargeOption) => {
    haptic.tap();
    setOptId(o.id);
    setResource(o.resourceName);
    setRate(String(suggestPrice(o.rate)));
    setVisit(o.visitCharge ? String(suggestPrice(o.visitCharge)) : '');
    setReading('');
    setStep(2);
  };

  const pick = async () => {
    const c = await pickContact();
    if (c) { setCustName(c.name); setCustPhone(c.phone); }
  };

  const finish = (withCustomer: boolean) => {
    if (!opt) return;
    const wsId = createWorkspace({
      name: business.trim(), template: t.id, phone: phone.trim() || undefined, upiId: reg.upi ? upi.trim() || undefined : undefined,
      country, lang: lang === 'hi' ? 'hi' : 'en',
    });
    const g = reg.splitTax ? cleanGstin(gstin) : gstin.trim() || null;
    updateWorkspace(wsId, {
      ...(g ? { gstin: g, gstRate: reg.defaultTaxRate, invoicePrefix: 'INV-', paymentTermsDays: reg.code === 'IN' ? 15 : 14 } : {}),
      ...(!reg.upi && payLink.trim() ? { payLink: payLink.trim() } : {}),
      ...(!g && reg.code !== 'IN' ? { invoicePrefix: 'INV-', paymentTermsDays: 14 } : {}),
    });
    const hasReading = (opt.measure === 'hourmeter' || opt.measure === 'odometer') && readingVal !== null && isFinite(readingVal);
    const resId = addResource(wsId, resource.trim(), opt.kind, hasReading ? readingVal : null);
    saveRate(wsId, {
      resourceId: resId, unit: opt.unit, amountPaise: ratePaise!, measure: opt.measure,
      visitChargePaise: opt.unit === 'hour' ? parseRupees(visit) ?? 0 : 0,
    });
    if (withCustomer && custName.trim()) addCustomer(wsId, { name: custName.trim(), phone: custPhone.trim() || null });
    haptic.success();
    router.replace('/');
  };

  const canNext = step === 0 ? business.trim().length > 0 && gstOk
    : step === 2 ? resource.trim().length > 0 && !!ratePaise && ratePaise > 0 : true;
  const total = 4;

  const preview = useMemo(() => {
    if (!opt || !ratePaise) return null;
    const m = MEASURE_TEXT[opt.measure];
    return `${m.title}: ${m.body.charAt(0).toLowerCase()}${m.body.slice(1)}.`;
  }, [opt, ratePaise]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: brand.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingHorizontal: 20, paddingTop: 12, flexDirection: 'row', alignItems: 'center' }}>
          <Button compact icon="arrow-left" onPress={() => (step === 0 ? router.back() : setStep(step - 1))} textColor={brand.muted}>Back</Button>
          <View style={{ flex: 1, flexDirection: 'row', gap: 6, marginLeft: 8 }}>
            {Array.from({ length: total }, (_, i) => (
              <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= step ? brand.primary : brand.line }} />
            ))}
          </View>
          <Text style={{ marginLeft: 12, color: brand.muted }}>{step + 1} of {total}</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <FadeIn key="s0" style={{ gap: 14 }}>
              <IconBubble icon="storefront-outline" size={56} />
              <Text style={{ fontSize: 26, fontWeight: '800', color: brand.ink }}>What should we call your business?</Text>
              <Text style={{ color: brand.muted, fontSize: 15 }}>This name goes at the top of your bills. Your own name is fine.</Text>
              <TextInput mode="outlined" label="Business or your name" value={business} onChangeText={setBusiness} autoFocus />
              <Text style={{ fontWeight: '700', color: brand.ink }}>{tx('setup.country')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {COUNTRY_LIST.map((c) => (
                  <Button key={c} compact mode={country === c ? 'contained' : 'outlined'} onPress={() => setCountry(c)}>{REGIONS[c].name}</Button>
                ))}
              </View>
              <Text style={{ color: brand.muted, fontSize: 13 }}>
                Bills in {reg.currency} · {reg.taxName} · distance in {reg.distance === 'mi' ? 'miles' : 'km'}
              </Text>
              <TextInput mode="outlined" label="Phone number (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
              {reg.upi ? (
                <>
                  <TextInput mode="outlined" label="UPI ID (optional)" value={upi} onChangeText={setUpi} autoCapitalize="none" right={<TextInput.Icon icon="qrcode" />} />
                  <Text style={{ color: brand.muted, fontSize: 13 }}>With a UPI ID, customers can pay you straight from the bill.</Text>
                </>
              ) : (
                <>
                  <TextInput mode="outlined" label="Payment link (optional)" value={payLink} onChangeText={setPayLink} autoCapitalize="none" keyboardType="url"
                    placeholder="https://buy.stripe.com/… or https://paypal.me/…" right={<TextInput.Icon icon="link-variant" />} />
                  <Text style={{ color: brand.muted, fontSize: 13 }}>A Stripe, PayPal, Square or bank payment link. It goes on every bill with a QR code.</Text>
                </>
              )}
              <TextInput mode="outlined" label={`${reg.taxIdLabel} (optional, for tax invoices)`} value={gstin} onChangeText={setGstin}
                autoCapitalize="characters" error={!gstOk} />
              <Text style={{ color: gstOk ? brand.muted : brand.danger, fontSize: 13 }}>
                {gstOk ? `Leave empty if you are not registered for ${reg.taxName}.` : 'A GSTIN has 15 characters, like 27AAPFU0939F1ZV.'}
              </Text>
            </FadeIn>
          )}

          {step === 1 && (
            <FadeIn key="s1" style={{ gap: 12 }}>
              <Text style={{ fontSize: 26, fontWeight: '800', color: brand.ink }}>How do you charge?</Text>
              <Text style={{ color: brand.muted, fontSize: 15 }}>Pick the closest one. You can add other ways later.</Text>
              {t.id === 'equipment' ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {([['machine', 'A machine', 'excavator'], ['vehicle', 'A car or vehicle', 'car']] as const).map(([v, l, ic]) => (
                    <Tap key={v} onPress={() => { haptic.tap(); setRents(v); setOptId(null); }} label={l} style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.pill, paddingVertical: 10,
                        backgroundColor: rents === v ? brand.ink : brand.surface, borderWidth: 1, borderColor: rents === v ? brand.ink : brand.line }}>
                        <MaterialCommunityIcons name={ic} size={18} color={rents === v ? '#fff' : brand.ink} />
                        <Text style={{ fontWeight: '700', color: rents === v ? '#fff' : brand.ink }}>{l}</Text>
                      </View>
                    </Tap>
                  ))}
                </View>
              ) : null}
              {options.map((o) => (
                <Tap key={o.id} onPress={() => choose(o)} label={o.title}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: brand.surface, borderRadius: radius.md, padding: 14,
                    borderWidth: 1.5, borderColor: optId === o.id ? brand.primary : brand.line }}>
                    <IconBubble icon={o.icon} size={42} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: brand.ink }}>{o.title}</Text>
                      <Text style={{ fontSize: 13, color: brand.muted, marginTop: 2 }}>{localPrices(o.example)}</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={22} color="#B5B0A4" />
                  </View>
                </Tap>
              ))}
            </FadeIn>
          )}

          {step === 2 && opt && (
            <FadeIn key="s2" style={{ gap: 14 }}>
              <IconBubble icon={opt.icon} size={56} />
              <Text style={{ fontSize: 26, fontWeight: '800', color: brand.ink }}>Your price</Text>
              <TextInput mode="outlined" label={opt.kind === 'machine' || t.id === 'equipment' ? 'Name of the machine or vehicle' : 'What you charge for'}
                value={resource} onChangeText={setResource} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TextInput mode="outlined" label="Price" value={rate} onChangeText={setRate} keyboardType="decimal-pad"
                  left={<TextInput.Affix text={currencySymbol()} />} style={{ flex: 1, fontSize: 22 }} />
                <Text style={{ fontSize: 18, color: brand.ink, fontWeight: '600' }}>per {unitWord?.one}</Text>
              </View>
              {opt.unit === 'hour' && opt.visitCharge !== undefined ? (
                <TextInput mode="outlined" label="Visit charge (optional, added once per job)" value={visit} onChangeText={setVisit} keyboardType="decimal-pad"
                  left={<TextInput.Affix text={currencySymbol()} />} />
              ) : null}
              {opt.measure === 'hourmeter' || opt.measure === 'odometer' ? (
                <TextInput mode="outlined" label={opt.measure === 'hourmeter' ? 'Hours shown on the machine now (optional)' : 'Km shown on the dashboard now (optional)'}
                  value={reading} onChangeText={setReading} keyboardType="decimal-pad" />
              ) : null}
              {preview ? (
                <View style={{ flexDirection: 'row', gap: 10, backgroundColor: brand.primarySoft, borderRadius: radius.md, padding: 12 }}>
                  <MaterialCommunityIcons name={MEASURE_TEXT[opt.measure].icon as any} size={20} color={brand.primary} />
                  <Text style={{ flex: 1, color: brand.primary }}>{preview}</Text>
                </View>
              ) : null}
              <Text style={{ color: brand.muted, fontSize: 13 }}>You can add more prices later in More → Prices.</Text>
            </FadeIn>
          )}

          {step === 3 && (
            <FadeIn key="s3" style={{ gap: 14 }}>
              <IconBubble icon="account-plus-outline" size={56} />
              <Text style={{ fontSize: 26, fontWeight: '800', color: brand.ink }}>Who is your first {t.customerWord.toLowerCase()}?</Text>
              <Text style={{ color: brand.muted, fontSize: 15 }}>Add one now, or skip and do it at your first job.</Text>
              <Button mode="contained-tonal" icon="contacts" onPress={pick} contentStyle={{ minHeight: 52 }}>Choose from contacts</Button>
              <Text style={{ textAlign: 'center', color: brand.muted }}>or type it</Text>
              <TextInput mode="outlined" label={`${t.customerWord} name`} value={custName} onChangeText={setCustName} />
              <TextInput mode="outlined" label="Phone (for WhatsApp bills)" value={custPhone} onChangeText={setCustPhone} keyboardType="phone-pad" />
            </FadeIn>
          )}
        </ScrollView>

        <View style={{ padding: 20, gap: 8 }}>
          {step === 1 ? null : step < 3 ? (
            <Button mode="contained" disabled={!canNext} onPress={() => setStep(step + 1)} contentStyle={{ minHeight: 56 }} labelStyle={{ fontSize: 17, fontWeight: '700' }}>
              Continue
            </Button>
          ) : (
            <>
              <Button mode="contained" onPress={() => finish(true)} contentStyle={{ minHeight: 56 }} labelStyle={{ fontSize: 17, fontWeight: '700' }}>
                {custName.trim() ? 'Finish setup' : 'Finish without a customer'}
              </Button>
              {custName.trim() ? <Button onPress={() => finish(false)} textColor={brand.muted}>Skip customer</Button> : null}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
