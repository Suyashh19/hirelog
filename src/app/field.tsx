import React, { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { listRates, listResources } from '../db/repo';
import { haversineM, m2ToAcres, m2ToHectares, polygonAreaM2 } from '../core/geo';
import { hasFeature } from '../billing/plan';
import { Label, ProBadge, SummaryCard } from '../ui/premium';
import { brand, radius, tabular } from '../ui/theme';
import { haptic } from '../ui/haptics';

type P = { lat: number; lon: number; acc: number | null };

/**
 * Measure a field by walking or driving around its edge with the phone. Keep the app open.
 * Points with poor accuracy (over 20 m) are skipped; the shape closes itself back to the start.
 */
export default function Field() {
  const [points, setPoints] = useState<P[]>([]);
  const [running, setRunning] = useState(false);
  const [acc, setAcc] = useState<number | null>(null);
  const sub = useRef<Location.LocationSubscription | null>(null);
  useEffect(() => () => sub.current?.remove(), []);

  const start = async () => {
    if (!hasFeature('field-area')) { router.push({ pathname: '/paywall', params: { trigger: 'field-area' } }); return; }
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') { Alert.alert('Location needed', 'Allow location so the phone can trace the field.'); return; }
    setPoints([]);
    setRunning(true);
    haptic.press();
    sub.current = await Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 3, timeInterval: 2000 }, (l) => {
      setAcc(l.coords.accuracy ?? null);
      if (l.coords.accuracy !== null && l.coords.accuracy > 20) return;
      const p = { lat: l.coords.latitude, lon: l.coords.longitude, acc: l.coords.accuracy };
      setPoints((prev) => (prev.length && haversineM(prev[prev.length - 1], p) < 3 ? prev : [...prev, p]));
    });
  };
  const stop = () => {
    sub.current?.remove();
    sub.current = null;
    setRunning(false);
    haptic.success();
  };

  const area = polygonAreaM2(points);
  const acres = m2ToAcres(area);
  const perimeter = points.reduce((s, p, i) => (i ? s + haversineM(points[i - 1], p) : 0), 0);
  const gap = points.length > 2 ? haversineM(points[points.length - 1], points[0]) : 0;
  const acreRate = listRates().find((r) => r.unit === 'acre' && !r.customerId);
  const resource = acreRate ? listResources().find((r) => r.id === acreRate.resourceId) : null;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
      <SummaryCard>
        <Label dark>Field area</Label>
        <Text style={[tabular, { color: '#fff', fontSize: 40, fontWeight: '800' }]}>{acres.toFixed(2)} acres</Text>
        <Text style={{ color: brand.onDarkMuted }}>{m2ToHectares(area).toFixed(2)} hectares · {Math.round(area).toLocaleString()} m²</Text>
        <Text style={{ color: brand.onDarkMuted, marginTop: 6 }}>
          {points.length} points · edge {Math.round(perimeter)} m{acc !== null && running ? ` · GPS ±${Math.round(acc)} m` : ''}
        </Text>
      </SummaryCard>

      {!hasFeature('field-area') ? <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><ProBadge small /><Text style={{ color: brand.muted }}>Measuring fields is part of Pro.</Text></View> : null}

      <View style={{ backgroundColor: brand.surface, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: brand.line, gap: 6 }}>
        <Text style={{ fontWeight: '800', color: brand.ink }}>How to measure</Text>
        <Text style={{ color: brand.muted }}>1. Stand at one corner and tap Start.</Text>
        <Text style={{ color: brand.muted }}>2. Walk or drive slowly along the edge, all the way round. Keep this screen open.</Text>
        <Text style={{ color: brand.muted }}>3. Tap Finish back at the corner you started from.</Text>
        {running && points.length > 5 && gap > 30 ? <Text style={{ color: brand.pending }}>You are {Math.round(gap)} m from the start — keep going round.</Text> : null}
        {running && acc !== null && acc > 20 ? <Text style={{ color: brand.pending }}>Weak GPS (±{Math.round(acc)} m). Go to open sky for a better reading.</Text> : null}
      </View>

      {running ? (
        <Button mode="contained" icon="flag-checkered" onPress={stop} contentStyle={{ minHeight: 56 }}>Finish</Button>
      ) : (
        <Button mode="contained" icon="walk" onPress={start} contentStyle={{ minHeight: 56 }}>{points.length ? 'Measure again' : 'Start'}</Button>
      )}
      {!running && acres > 0 ? (
        <Button mode="contained-tonal" icon="clipboard-plus-outline" contentStyle={{ minHeight: 52 }}
          onPress={() => router.replace({ pathname: '/entry/new', params: { resourceId: resource?.id ?? '', qty: String(acres), note: `Field measured by GPS: ${acres} acres` } })}>
          {acreRate ? `Bill ${acres} acres` : 'Use for a job'}
        </Button>
      ) : null}
      {!acreRate ? <Text style={{ color: brand.muted, fontSize: 13 }}>Tip: add a price &quot;per acre&quot; in More → Prices to bill fields directly.</Text> : null}
    </ScrollView>
  );
}
