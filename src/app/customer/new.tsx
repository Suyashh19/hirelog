import React, { useState } from 'react';
import { currencySymbol, region } from '../../core/region';
import { ScrollView, View } from 'react-native';
import { Button, Dialog, Portal, Text, TextInput } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { addCustomer, addSite, deleteCustomer, deleteSite, getCustomer, getWorkspace, listSites, updateCustomer } from '../../db/repo';
import { useLive } from '../../ui/hooks';
import { parseRupees } from '../../core/money';
import { checkCanAdd } from '../../billing/plan';
import { pickContact } from '../../ui/contacts';
import { cleanGstin } from '../../core/gst';
import { brand } from '../../ui/theme';

/** Add a customer, or edit/remove one when opened with ?id=. */
export default function CustomerForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = id ? getCustomer(id) : null;
  const [name, setName] = useState(existing?.name ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [area, setArea] = useState(existing?.area ?? '');
  const [opening, setOpening] = useState('');
  const [gstin, setGstin] = useState(existing?.gstin ?? '');
  const reg = region();
  const gstOk = !gstin.trim() || !reg.splitTax || !!cleanGstin(gstin);
  const taxId = () => (reg.splitTax ? cleanGstin(gstin) : gstin.trim() || null);
  const [tds, setTds] = useState<number | null>(existing?.tdsRate ?? null);
  const [confirm, setConfirm] = useState(false);
  const [siteName, setSiteName] = useState('');
  const sites = useLive(() => (id ? listSites(id) : []), [id]);
  const [err, setErr] = useState<string | null>(null);

  const choose = async () => {
    const c = await pickContact();
    if (c) { setName(c.name); setPhone(c.phone); }
  };
  const save = () => {
    const ws = getWorkspace();
    if (!ws || !name.trim() || !gstOk) return;
    if (existing) {
      updateCustomer(existing.id, { name: name.trim(), phone: phone.trim() || null, area: area.trim() || null, gstin: taxId(), tdsRate: tds });
      router.back();
      return;
    }
    const blocked = checkCanAdd('customer');
    if (blocked) { router.replace({ pathname: '/paywall', params: { trigger: blocked.trigger } }); return; }
    addCustomer(ws.id, { name: name.trim(), phone: phone.trim() || null, area: area.trim() || null, openingBalancePaise: parseRupees(opening) ?? 0, gstin: taxId(), tdsRate: tds });
    router.back();
  };
  const remove = () => {
    if (!existing) return;
    const r = deleteCustomer(existing.id);
    if (!r.ok) { setConfirm(false); setErr(r.reason ?? 'Could not remove.'); return; }
    setConfirm(false);
    router.dismissAll();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      {!existing ? <Button icon="contacts" mode="contained-tonal" onPress={choose} contentStyle={{ minHeight: 52 }}>Choose from contacts</Button> : null}
      <TextInput mode="outlined" label="Name" value={name} onChangeText={setName} />
      <TextInput mode="outlined" label="Phone (for WhatsApp bills)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <TextInput mode="outlined" label="Area / address (optional)" value={area} onChangeText={setArea} />
      <TextInput mode="outlined" label={`Their ${reg.taxIdLabel} (optional, for tax invoices)`} value={gstin} onChangeText={setGstin} autoCapitalize="characters" error={!gstOk} />
      {!gstOk ? <Text style={{ color: brand.danger }}>A GSTIN has 15 characters, like 27AAPFU0939F1ZV.</Text> : null}
      {reg.code === 'IN' ? (
        <View style={{ gap: 6 }}>
          <Text>Do they deduct TDS from your payments?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {[null, 1, 2, 10].map((r) => (
              <Button key={String(r)} compact mode={tds === r ? 'contained' : 'outlined'} onPress={() => setTds(r)}>{r === null ? 'No' : `${r}%`}</Button>
            ))}
          </View>
          {tds ? <Text style={{ color: brand.muted, fontSize: 13 }}>Bills show &quot;Less TDS {tds}%&quot; and the amount they actually pay you. Usually 10% for professional fees (194J), 1–2% for contracts (194C).</Text> : null}
        </View>
      ) : null}
      {!existing ? (
        <TextInput mode="outlined" label={`Old balance they owe you in ${currencySymbol()} (optional)`} value={opening} onChangeText={setOpening} keyboardType="decimal-pad" />
      ) : null}
      <Button mode="contained" disabled={!name.trim()} onPress={save} contentStyle={{ minHeight: 56 }}>{existing ? 'Save changes' : 'Save'}</Button>
      {existing ? (
        <View style={{ gap: 8, marginTop: 8 }}>
          <Text variant="titleMedium">Sites or projects</Text>
          <Text style={{ color: brand.muted }}>Optional. Use these when one customer has several places or jobs, and you want work and bills split by each.</Text>
          {sites.map((x) => (
            <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ flex: 1, fontSize: 16 }}>{x.name}</Text>
              <Button compact textColor={brand.danger} onPress={() => deleteSite(x.id)}>Remove</Button>
            </View>
          ))}
          <TextInput mode="outlined" label="New site or project name" value={siteName} onChangeText={setSiteName} />
          <Button mode="contained-tonal" icon="plus" disabled={!siteName.trim()} onPress={() => {
            const ws = getWorkspace();
            if (ws && existing) addSite(ws.id, existing.id, siteName.trim());
            setSiteName('');
          }}>Add site</Button>
        </View>
      ) : null}
      {existing ? <Button textColor={brand.danger} icon="delete-outline" onPress={() => setConfirm(true)}>Remove this customer</Button> : null}
      {err ? <View><Text style={{ color: brand.danger }}>{err}</Text></View> : null}
      <Portal>
        <Dialog visible={confirm} onDismiss={() => setConfirm(false)} style={{ backgroundColor: '#fff' }}>
          <Dialog.Title>Remove {existing?.name}?</Dialog.Title>
          <Dialog.Content><Text>They will disappear from your list. Past entries and bills are kept.</Text></Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirm(false)}>Keep</Button>
            <Button textColor={brand.danger} onPress={remove}>Remove</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  );
}
