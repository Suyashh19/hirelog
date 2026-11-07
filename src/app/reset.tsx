import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../cloud';
import { syncNow } from '../sync/sync';
import { FadeIn, IconBubble } from '../ui/components';
import { brand } from '../ui/theme';

/**
 * Opened by the link in the "reset password" email (hourlytracker://reset in a real build, exp://…/--/reset in Expo Go).
 * The link carries a short-lived session in its #fragment; we adopt it, then let the person choose a new password.
 */
export default function ResetPassword() {
  const url = Linking.useURL();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!url) return;
    const frag = url.includes('#') ? url.split('#')[1] : url.split('?')[1] ?? '';
    const p = new URLSearchParams(frag);
    const problem = p.get('error_description') ?? p.get('error');
    if (problem) { setErr(decodeURIComponent(problem.replace(/\+/g, ' '))); return; }
    const access_token = p.get('access_token');
    const refresh_token = p.get('refresh_token');
    if (access_token && refresh_token) {
      supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
        if (error) setErr('This reset link has expired. Ask for a new one.'); else setReady(true);
      });
    }
  }, [url]);

  const save = async () => {
    if (pw.length < 6) { setErr('Use a password with at least 6 characters.'); return; }
    if (pw !== pw2) { setErr('The two passwords do not match.'); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setDone(true);
    void syncNow();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: brand.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
        <FadeIn style={{ gap: 14 }}>
          <IconBubble icon="lock-reset" size={56} />
          <Text style={{ fontSize: 26, fontWeight: '800', color: brand.ink }}>Choose a new password</Text>
          {done ? (
            <>
              <Text style={{ color: brand.money, fontSize: 16 }}>Your password was changed and you are signed in.</Text>
              <Button mode="contained" onPress={() => router.replace('/')} contentStyle={{ minHeight: 56 }}>Continue</Button>
            </>
          ) : !ready ? (
            <>
              <Text style={{ color: brand.muted, fontSize: 15 }}>
                {err ?? 'Open the reset link from your email on this phone. This screen then lets you set a new password.'}
              </Text>
              <Button onPress={() => router.replace('/sign-in')}>Back to sign in</Button>
            </>
          ) : (
            <>
              <TextInput mode="outlined" label="New password (6+ characters)" value={pw} onChangeText={setPw} secureTextEntry={!show} autoCapitalize="none"
                right={<TextInput.Icon icon={show ? 'eye-off' : 'eye'} onPress={() => setShow(!show)} />} />
              <TextInput mode="outlined" label="Type it again" value={pw2} onChangeText={setPw2} secureTextEntry={!show} autoCapitalize="none" />
              <Button mode="contained" onPress={save} loading={busy} disabled={busy || pw.length < 6} contentStyle={{ minHeight: 56 }}>Save new password</Button>
              {err ? <View><Text style={{ color: brand.danger }}>{err}</Text></View> : null}
            </>
          )}
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
}
