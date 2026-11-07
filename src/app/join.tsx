import React, { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { router } from 'expo-router';
import { useSession } from '../cloud';
import { joinWithCode } from '../data/team';
import { getWorkspace } from '../db/repo';
import { brand } from '../ui/theme';
import { haptic } from '../ui/haptics';

/** Operator/driver: join the owner's business with the 6-digit code. */
export default function Join() {
  const session = useSession();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ok = /^\d{6}$/.test(code.trim());

  const join = async () => {
    setBusy(true); setErr(null);
    const r = await joinWithCode(code);
    setBusy(false);
    if (r.ok) { haptic.success(); Alert.alert('You joined', `You are now in ${getWorkspace()?.name ?? 'the team'}.`); router.replace('/'); }
    else setErr(r.message ?? 'Could not join.');
  };
  const confirmJoin = () => {
    if (getWorkspace()) {
      Alert.alert('Replace the business on this phone?', 'Joining a team shows the owner\'s business here instead of yours. Back up your own data first if you need it.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Join', onPress: () => void join() },
      ]);
    } else void join();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Text style={{ fontSize: 22, fontWeight: '800', color: brand.ink }}>Join your owner&apos;s team</Text>
      <Text style={{ color: brand.muted }}>Your owner makes a 6-digit code in More → Team. Enter it here to log work for their business.</Text>
      {!session ? (
        <Button mode="contained" icon="login" onPress={() => router.push('/sign-in')}>Sign in first</Button>
      ) : (
        <>
          <TextInput mode="outlined" label="6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6}
            style={{ fontSize: 28, letterSpacing: 6 }} autoFocus />
          <Button mode="contained" disabled={!ok || busy} loading={busy} onPress={confirmJoin} contentStyle={{ minHeight: 52 }}>Join</Button>
          {err ? <Text style={{ color: brand.danger }}>{err}</Text> : null}
        </>
      )}
    </ScrollView>
  );
}
