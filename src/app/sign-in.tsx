import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../cloud';
import { adoptCloudWorkspace, syncNow } from '../sync/sync';
import { getWorkspace } from '../db/repo';
import { appLink, signInWithGoogle } from '../data/google';
import { Card, FadeIn, IconBubble } from '../ui/components';
import { brand } from '../ui/theme';

/** Turns Supabase's technical messages into plain English. */
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'Wrong email or password. Check them and try again.';
  if (m.includes('not confirmed')) return 'Your email is not confirmed yet. Open the confirmation email, tap its link, then sign in.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many emails were sent. Please wait a few minutes and try again.';
  if (m.includes('already registered')) return 'This email already has an account. Choose "I already have an account" and sign in.';
  if (m.includes('password') && m.includes('characters')) return 'Use a password with at least 6 characters.';
  if (m.includes('network') || m.includes('fetch')) return 'No internet connection. Please connect and try again.';
  if (m.includes('provider is not enabled') || m.includes('unsupported provider')) return 'Google sign-in is not switched on yet. Use your email for now.';
  return message;
}

type Step = 'form' | 'confirm';

/** Email + password. New accounts must confirm their email once (link in the email), then sign in. */
export default function SignIn() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<'in' | 'up'>(params.mode === 'in' ? 'in' : 'up');
  const [step, setStep] = useState<Step>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const cleanEmail = email.trim().toLowerCase();
  const needsConfirm = !!err && err.toLowerCase().includes('not confirmed');

  const finish = async () => {
    const had = !!getWorkspace();
    if (!had) await adoptCloudWorkspace();
    void syncNow();
    if (!had && getWorkspace()) router.replace('/'); // business came down from the cloud
    else if (!had) router.replace('/welcome'); // new account, nothing in the cloud yet: set up
    else router.back();
  };

  const signIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    if (error) { setErr(friendly(error.message)); return false; }
    await finish();
    return true;
  };

  const submit = async () => {
    setBusy(true); setErr(null); setInfo(null);
    try {
      if (mode === 'in') { await signIn(); return; }
      const { data, error } = await supabase.auth.signUp({ email: cleanEmail, password });
      if (error) { setErr(friendly(error.message)); return; }
      // Supabase hides whether an email exists: an empty identities list means it was already registered.
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        setMode('in');
        setErr('This email already has an account. Sign in with your password instead.');
        return;
      }
      if (data.session) { await finish(); return; } // confirmation switched off: signed in straight away
      setStep('confirm');
    } catch (e: any) {
      setErr(friendly(String(e?.message ?? e)));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true); setErr(null); setInfo(null);
    const { error } = await supabase.auth.resend({ type: 'signup', email: cleanEmail });
    setBusy(false);
    if (error) setErr(friendly(error.message)); else setInfo('We sent the email again. It can take a minute.');
  };

  const forgot = async () => {
    if (!cleanEmail.includes('@')) { setErr('Type your email address above first, then tap "Forgot password?".'); return; }
    setBusy(true); setErr(null); setInfo(null);
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo: appLink('reset') });
    setBusy(false);
    if (error) setErr(friendly(error.message));
    else setInfo('If an account exists for this email, we sent a link to reset the password. Open it on this phone.');
  };

  const google = async () => {
    setBusy(true); setErr(null); setInfo(null);
    try {
      const r = await signInWithGoogle();
      if (r.ok) await finish();
      else if (!r.cancelled) setErr(friendly(r.message ?? 'Google sign-in did not finish. Please try again.'));
    } catch (e: any) {
      setErr(friendly(String(e?.message ?? e)));
    } finally {
      setBusy(false);
    }
  };

  const confirmedSignIn = async () => {
    setBusy(true); setErr(null); setInfo(null);
    try { await signIn(); } finally { setBusy(false); }
  };

  if (step === 'confirm') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: brand.bg }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
          <FadeIn style={{ gap: 14 }}>
            <IconBubble icon="email-check-outline" size={56} />
            <Text style={{ fontSize: 26, fontWeight: '800', color: brand.ink }}>Confirm your email</Text>
            <Card style={{ gap: 8 }}>
              <Step n={1} text={`Open the email we sent to ${cleanEmail}.`} />
              <Step n={2} text={'Tap the "Confirm" link in it. The page that opens may look empty or show an error. That is normal.'} />
              <Step n={3} text="Come back here and press the button below." />
            </Card>
            <Button mode="contained" onPress={confirmedSignIn} loading={busy} disabled={busy} contentStyle={{ minHeight: 56 }}>
              I confirmed my email — sign in
            </Button>
            <Button onPress={resend} disabled={busy}>Send the email again</Button>
            <Button onPress={() => { setStep('form'); setErr(null); setInfo(null); }} textColor={brand.muted}>Use a different email</Button>
            {info ? <Text style={{ color: brand.money }}>{info}</Text> : null}
            {err ? <Text style={{ color: brand.danger }}>{err}</Text> : null}
          </FadeIn>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: brand.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
        <FadeIn style={{ gap: 14 }}>
          <IconBubble icon="cloud-sync-outline" size={56} />
          <Text style={{ fontSize: 26, fontWeight: '800', color: brand.ink }}>
            {mode === 'up' ? 'Back up and use on more phones' : 'Welcome back'}
          </Text>
          <Text style={{ color: brand.muted, fontSize: 15 }}>
            Your work stays on this phone first and syncs whenever you are online.
          </Text>
          <Button mode="outlined" icon="google" onPress={google} disabled={busy} contentStyle={{ minHeight: 56 }}
            style={{ borderColor: brand.ink, backgroundColor: '#fff' }} textColor={brand.ink}>
            Continue with Google
          </Button>
          <Text style={{ textAlign: 'center', color: brand.muted }}>or use your email</Text>
          <TextInput mode="outlined" label="Email address" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoCorrect={false} />
          <TextInput mode="outlined" label="Password (6+ characters)" value={password} onChangeText={setPassword} secureTextEntry={!showPw} autoCapitalize="none"
            right={<TextInput.Icon icon={showPw ? 'eye-off' : 'eye'} onPress={() => setShowPw(!showPw)} />} />
          <Button mode="contained" onPress={submit} loading={busy} disabled={busy || !cleanEmail.includes('@') || password.length < 6} contentStyle={{ minHeight: 56 }}>
            {mode === 'up' ? 'Create account' : 'Sign in'}
          </Button>
          {mode === 'in' ? <Button onPress={forgot} disabled={busy}>Forgot password?</Button> : null}
          {needsConfirm ? <Button onPress={resend} disabled={busy}>Send the confirmation email again</Button> : null}
          <Button onPress={() => { setMode(mode === 'up' ? 'in' : 'up'); setErr(null); setInfo(null); }}>
            {mode === 'up' ? 'I already have an account' : 'Create a new account'}
          </Button>
          {info ? <View><Text style={{ color: brand.money }}>{info}</Text></View> : null}
          {err ? <View><Text style={{ color: brand.danger }}>{err}</Text></View> : null}
          <Button onPress={() => router.back()} textColor={brand.muted}>Not now</Button>
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: brand.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: brand.primary, fontWeight: '800' }}>{n}</Text>
      </View>
      <Text style={{ flex: 1, color: brand.ink, fontSize: 15 }}>{text}</Text>
    </View>
  );
}
