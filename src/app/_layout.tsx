import React, { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { ThemeProvider, DefaultTheme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { migrate } from '../db/client';
import { getWorkspace, one } from '../db/repo';
import { useLive } from '../ui/hooks';
import { hasFeature } from '../billing/plan';
import { planReminders } from '../money/reminders';
import { lightTheme } from '../ui/theme';
import { setupNotifications } from '../timer/notification';
import { startSync, adoptCloudWorkspace } from '../sync/sync';
import { supabase } from '../cloud';
import '../trip/gps'; // registers the background GPS task at startup (installed app)

migrate();

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setupNotifications();
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session && !getWorkspace()) await adoptCloudWorkspace();
      setReady(true);
      startSync();
    })();
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const type = (r.notification.request.content.data as any)?.type;
      router.navigate(type === 'reminder' ? '/to-collect' : '/');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!getWorkspace()) router.replace('/welcome');
  }, [ready]);

  // Payment reminders follow the open bills: re-plan when they change (Pro)
  const openBillsSig = useLive(() => {
    const r = one<{ n: number; s: number; last: number }>(
      "SELECT COUNT(*) AS n, COALESCE(SUM(total_paise),0) AS s, COALESCE(MAX(updated_at),0) AS last FROM bills WHERE deleted_at IS NULL AND status IN ('sent','partly_paid')");
    return `${r?.n}-${r?.s}-${r?.last}-${getWorkspace()?.reminderDays ?? ''}-${hasFeature('reminders')}`;
  }, []);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => { void planReminders(hasFeature('reminders')); }, 3000);
    return () => clearTimeout(t);
  }, [ready, openBillsSig]);

  const theme = lightTheme;
  return (
    <PaperProvider theme={theme}>
      <StatusBar style="dark" />
      <ThemeProvider value={DefaultTheme}>
      <Stack screenOptions={{ contentStyle: { backgroundColor: theme.colors.background }, headerStyle: { backgroundColor: theme.colors.background }, headerShadowVisible: false, headerTintColor: theme.colors.primary, headerTitleStyle: { color: theme.colors.onSurface, fontWeight: '700' } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="setup" options={{ headerShown: false }} />
        <Stack.Screen name="entry/new" options={{ title: 'Add work', presentation: 'modal' }} />
        <Stack.Screen name="entry/[id]" options={{ title: 'Entry' }} />
        <Stack.Screen name="customer/new" options={{ title: 'New customer', presentation: 'modal' }} />
        <Stack.Screen name="customer/rate" options={{ title: 'Special rate', presentation: 'modal' }} />
        <Stack.Screen name="customer/[id]" options={{ title: 'Ledger' }} />
        <Stack.Screen name="bill/[id]" options={{ title: 'Bill' }} />
        <Stack.Screen name="bill/preview" options={{ title: 'Bill preview' }} />
        <Stack.Screen name="payment/new" options={{ title: 'Payment received', presentation: 'modal' }} />
        <Stack.Screen name="resources" options={{ title: 'Prices' }} />
        <Stack.Screen name="settings" options={{ title: 'Business profile' }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="reset" options={{ headerShown: false }} />
        <Stack.Screen name="auth-callback" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="paywall" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="entries" options={{ title: 'All entries' }} />
        <Stack.Screen name="to-collect" options={{ title: 'To collect' }} />
        <Stack.Screen name="quotes/index" options={{ title: 'Quotes' }} />
        <Stack.Screen name="quotes/[id]" options={{ title: 'Quote' }} />
        <Stack.Screen name="expenses/index" options={{ title: 'Expenses' }} />
        <Stack.Screen name="expenses/new" options={{ title: 'Add expense', presentation: 'modal' }} />
        <Stack.Screen name="team" options={{ title: 'Team' }} />
        <Stack.Screen name="join" options={{ title: 'Join a team' }} />
        <Stack.Screen name="field" options={{ title: 'Measure a field' }} />
      </Stack>
      </ThemeProvider>
    </PaperProvider>
  );
}
