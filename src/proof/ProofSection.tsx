import React, { useState } from 'react';
import { Alert, Image, Pressable, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { entryItemsFor, getCustomer, getWorkspace, type EntryRow } from '../db/repo';
import { useLive } from '../ui/hooks';
import { ProBadge } from '../ui/premium';
import { brand, radius } from '../ui/theme';
import { hasFeature } from '../billing/plan';
import { formatMoney } from '../core/money';
import { openWhatsApp } from '../bills/share';
import { addPhoto, deletePhoto, listPhotos } from './photos';
import { askToConfirm, confirmAvailable, confirmBadge, workSummary } from './confirm';
import { t } from '../i18n';

const when = (ms: number) => new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Proof for one entry: customer confirmation, photos, route, and a duty slip to share. */
export function ProofSection({ e }: { e: EntryRow }) {
  const photos = useLive(() => listPhotos(e.id), [e.id]);
  const [busy, setBusy] = useState(false);
  const badge = confirmBadge(e.confirmationStatus);
  const canConfirm = hasFeature('confirm');
  const canPhoto = hasFeature('photo-proof');

  const ask = async () => {
    if (!canConfirm) { router.push({ pathname: '/paywall', params: { trigger: 'confirm' } }); return; }
    setBusy(true);
    const r = await askToConfirm(e.id);
    setBusy(false);
    if (!r.ok) Alert.alert('Could not send', r.message);
  };
  const photo = async (from: 'camera' | 'library') => {
    if (!canPhoto) { router.push({ pathname: '/paywall', params: { trigger: 'photos' } }); return; }
    const r = await addPhoto(e.id, from);
    if (!r.ok && r.message) Alert.alert('Photo not added', r.message);
  };
  const dutySlip = async () => {
    const ws = getWorkspace();
    const cust = e.customerId ? getCustomer(e.customerId) : null;
    const items = entryItemsFor(e.id);
    const lines = [
      `*Duty slip — ${ws?.name ?? ''}*`,
      `${e.resourceName}${cust ? ` · for ${cust.name}` : ''}`,
      `Start: ${when(e.startedAt)}${e.endedAt ? `\nEnd: ${when(e.endedAt)}` : ''}`,
      e.gpsFrom || e.gpsTo ? `Route: ${e.gpsFrom ?? '?'} → ${e.gpsTo ?? '?'}` : '',
      `Work: ${workSummary(e)}`,
      ...items.map((i) => `${i.description}${i.quantity !== 1 ? ` ${i.quantity} × ${formatMoney(i.amountPaise)}` : ''}: ${formatMoney(Math.round(i.amountPaise * i.quantity))}`),
      `Total: ${formatMoney(e.amountPaise + e.itemsPaise)}`,
      badge ? `${badge.text}${e.confirmedAt ? ` (${when(e.confirmedAt)})` : ''}` : '',
    ].filter(Boolean);
    await openWhatsApp(cust?.phone ?? null, lines.join('\n'));
  };

  return (
    <View style={{ backgroundColor: brand.surface, borderRadius: radius.md, borderWidth: 1, borderColor: brand.line, padding: 14, gap: 12 }}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: brand.ink }}>Proof</Text>

      {/* Customer confirmation */}
      {badge ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MaterialCommunityIcons name={badge.icon as any} size={20} color={badge.tone === 'money' ? brand.money : brand.danger} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: badge.tone === 'money' ? brand.money : brand.danger }}>{badge.text}</Text>
            {e.confirmedAt ? <Text style={{ fontSize: 12, color: brand.muted }}>{when(e.confirmedAt)}</Text> : null}
            {e.confirmationNote ? <Text style={{ fontSize: 13, color: brand.ink }}>&quot;{e.confirmationNote}&quot;</Text> : null}
          </View>
        </View>
      ) : e.status !== 'running' && e.customerId ? (
        <View style={{ gap: 6 }}>
          {e.confirmToken ? <Text style={{ color: brand.muted, fontSize: 13 }}>{t('confirm.sent')} (updates when you are online).</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Button mode="contained-tonal" icon="check-decagram-outline" onPress={ask} loading={busy} disabled={busy || !confirmAvailable()} style={{ flex: 1 }}>
              {e.confirmToken ? 'Send the link again' : t('confirm.ask')}
            </Button>
            {!canConfirm ? <ProBadge small /> : null}
          </View>
          {!confirmAvailable() ? <Text style={{ color: brand.muted, fontSize: 12 }}>Turns on once the confirmation page is published.</Text> : null}
        </View>
      ) : null}

      {/* Route */}
      {e.gpsFrom || e.gpsTo ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MaterialCommunityIcons name="map-marker-path" size={18} color={brand.primary} />
          <Text style={{ flex: 1, color: brand.ink }}>{e.gpsFrom ?? '?'} → {e.gpsTo ?? '?'}{e.gpsKm != null ? ` · GPS ${e.gpsKm}` : ''}</Text>
        </View>
      ) : null}

      {/* Photos */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, fontWeight: '700', color: brand.ink }}>Photos {photos.length ? `(${photos.length})` : ''}</Text>
        {!canPhoto ? <ProBadge small plan="business" /> : null}
        <Button compact icon="camera-outline" onPress={() => photo('camera')}>Camera</Button>
        <Button compact icon="image-outline" onPress={() => photo('library')}>Gallery</Button>
      </View>
      {photos.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {photos.map((p) => (
            <Pressable key={p.id} onLongPress={() => Alert.alert('Delete this photo?', '', [
              { text: 'Keep', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deletePhoto(p.id) },
            ])}>
              <Image source={{ uri: p.uri }} style={{ width: 92, height: 92, borderRadius: 10, backgroundColor: brand.tint }} />
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={{ color: brand.muted, fontSize: 13 }}>Photo of the hours counter, the dashboard, the site or a receipt. Long-press a photo to delete it.</Text>
      )}

      {e.status !== 'running' ? (
        <Button mode="outlined" icon="clipboard-text-outline" onPress={dutySlip}>Share duty slip</Button>
      ) : null}
    </View>
  );
}
