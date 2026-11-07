import React from 'react';
import { currencySymbol } from '../core/region';
import { View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { recentItems, type ItemInput } from '../db/repo';
import { formatINR, parseRupees } from '../core/money';
import { hasFeature } from '../billing/plan';
import { useLive } from './hooks';
import { Tap } from './components';
import { ProBadge } from './premium';
import { brand, radius } from './theme';
import { haptic } from './haptics';

export interface ItemDraft { key: string; description: string; qty: string; price: string }

let seq = 0;
export const newDraft = (description = '', price = ''): ItemDraft => ({ key: `d${++seq}`, description, qty: '1', price });

/** Valid lines only, ready to save. */
export function draftsToItems(drafts: ItemDraft[]): ItemInput[] {
  return drafts
    .map((d) => ({ description: d.description.trim(), quantity: parseFloat(d.qty) || 0, amountPaise: parseRupees(d.price) ?? 0 }))
    .filter((i) => i.description && i.quantity > 0 && i.amountPaise > 0);
}
export const draftsTotal = (drafts: ItemDraft[]) => draftsToItems(drafts).reduce((s, i) => s + Math.round(i.amountPaise * i.quantity), 0);

/**
 * EN-4 materials / extra charges (Pro): several lines of description × quantity × price.
 * Recently used items appear as chips so a regular part is one tap.
 */
/** Usual extra charges for a kind of work (duty slip items for vehicles, transport/diesel for machines). */
export function presetsFor(unit: string | null | undefined, kind: string | null | undefined): string[] {
  if (unit === 'km' || (unit === 'day' && kind !== 'machine')) return ['Driver allowance', 'Night allowance', 'Toll', 'Parking', 'Permit / state tax'];
  if (kind === 'machine') return ['Transport (shifting)', 'Operator allowance', 'Diesel', 'Night shift'];
  return ['Travel', 'Parts', 'Visit'];
}

export function ItemsEditor({ drafts, onChange, title = 'Materials & extra charges', presets = [] }: {
  drafts: ItemDraft[]; onChange: (d: ItemDraft[]) => void; title?: string; presets?: string[];
}) {
  const allowed = hasFeature('materials');
  const recent = useLive(() => (allowed ? recentItems(8) : []), [allowed]);
  const set = (key: string, patch: Partial<ItemDraft>) => onChange(drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const remove = (key: string) => onChange(drafts.filter((d) => d.key !== key));
  const total = draftsTotal(drafts);

  if (!allowed) {
    return (
      <Tap onPress={() => router.push({ pathname: '/paywall', params: { trigger: 'materials' } })} label={title}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: brand.surface, borderRadius: radius.md, borderWidth: 1, borderColor: brand.line, padding: 14 }}>
          <MaterialCommunityIcons name="package-variant-closed" size={20} color={brand.muted} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={{ fontWeight: '700', color: brand.ink }}>{title}</Text>
            <Text style={{ fontSize: 13, color: brand.muted }}>Parts, wire, travel, fuel — with quantity and price</Text>
          </View>
          <ProBadge small />
        </View>
      </Tap>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: brand.ink }}>{title}</Text>
        {total > 0 ? <Text style={{ fontWeight: '800', color: brand.ink }}>{formatINR(total)}</Text> : null}
      </View>

      {drafts.map((d) => {
        const lineTotal = Math.round((parseRupees(d.price) ?? 0) * (parseFloat(d.qty) || 0));
        return (
          <View key={d.key} style={{ backgroundColor: brand.surface, borderRadius: radius.md, borderWidth: 1, borderColor: brand.line, padding: 10, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TextInput dense mode="outlined" label="Item" value={d.description} onChangeText={(v) => set(d.key, { description: v })} style={{ flex: 1 }} />
              <Tap onPress={() => { haptic.tap(); remove(d.key); }} label="Remove line">
                <View style={{ padding: 8 }}><MaterialCommunityIcons name="close-circle-outline" size={22} color={brand.muted} /></View>
              </Tap>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput dense mode="outlined" label="Qty" value={d.qty} onChangeText={(v) => set(d.key, { qty: v })} keyboardType="decimal-pad" style={{ width: 76 }} />
              <Text style={{ color: brand.muted }}>×</Text>
              <TextInput dense mode="outlined" label={`Price ${currencySymbol()}`} value={d.price} onChangeText={(v) => set(d.key, { price: v })} keyboardType="decimal-pad" style={{ flex: 1 }} />
              <Text style={{ minWidth: 70, textAlign: 'right', fontWeight: '700', color: brand.ink }}>{lineTotal > 0 ? formatINR(lineTotal) : '—'}</Text>
            </View>
          </View>
        );
      })}

      {presets.filter((p) => !drafts.some((d) => d.description.trim() === p) && !recent.some((r) => r.description === p)).length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {presets.filter((p) => !drafts.some((d) => d.description.trim() === p) && !recent.some((r) => r.description === p)).map((p) => (
            <Tap key={p} onPress={() => { haptic.tap(); onChange([...drafts, newDraft(p, '')]); }} label={`Add ${p}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill, borderWidth: 1, borderStyle: 'dashed', borderColor: '#BFB9AB', paddingHorizontal: 12, paddingVertical: 6 }}>
                <MaterialCommunityIcons name="plus" size={14} color={brand.muted} />
                <Text style={{ marginLeft: 4, fontSize: 13, color: brand.ink }}>{p}</Text>
              </View>
            </Tap>
          ))}
        </View>
      ) : null}

      {recent.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {recent.filter((r) => !drafts.some((d) => d.description.trim() === r.description)).slice(0, 6).map((r) => (
            <Tap key={r.description} onPress={() => { haptic.tap(); onChange([...drafts, newDraft(r.description, String(r.amountPaise / 100))]); }} label={`Add ${r.description}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: brand.line, backgroundColor: brand.surface, paddingHorizontal: 12, paddingVertical: 6 }}>
                <MaterialCommunityIcons name="plus" size={14} color={brand.primary} />
                <Text style={{ marginLeft: 4, fontSize: 13, color: brand.ink }}>{r.description} · {formatINR(r.amountPaise)}</Text>
              </View>
            </Tap>
          ))}
        </View>
      ) : null}

      <Tap onPress={() => { haptic.tap(); onChange([...drafts, newDraft()]); }} label="Add a line">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: '#BFB9AB', paddingVertical: 12 }}>
          <MaterialCommunityIcons name="plus" size={18} color={brand.primary} />
          <Text style={{ marginLeft: 6, color: brand.primary, fontWeight: '700' }}>Add material or charge</Text>
        </View>
      </Tap>
    </View>
  );
}
