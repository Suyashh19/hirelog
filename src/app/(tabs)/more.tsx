import React, { useState } from 'react';
import { t } from '../../i18n';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Dialog, Portal, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Tap } from '../../ui/components';
import { Avatar, ListGroup, ListItem, ProBadge, ScreenHeader } from '../../ui/premium';
import { brand, radius } from '../../ui/theme';
import { appLink } from '../../data/google';
import { exportAllJson } from '../../data/exports';
import { getWorkspace } from '../../db/repo';
import { useLive } from '../../ui/hooks';
import { useSession } from '../../cloud';
import { pendingCount, syncNow, useSyncStatus } from '../../sync/sync';
import { getPlan, hasFeature } from '../../billing/plan';
import { deleteEverything, exportEntriesCsv, signOutAccount } from '../../data/account';
import { supabase } from '../../cloud';

const STATE_TEXT: Record<string, string> = {
  signedout: 'Not signed in. Your data is on this phone only.',
  idle: 'Ready to sync', syncing: 'Syncing…', synced: 'Everything is backed up',
  offline: 'Will sync when you are online', blocked: 'Some data cannot sync on your plan', error: 'Sync problem — tap to retry',
};

export default function More() {
  const ws = useLive(() => getWorkspace(), []);
  const plan = useLive(() => getPlan(), []);
  const session = useSession();
  const sync = useSyncStatus();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signOutErr, setSignOutErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const planName = plan.plan === 'free' ? 'Free' : plan.plan === 'pro' ? 'Pro' : 'Business';
  const pending = pendingCount();

  const syncIcon = sync.state === 'synced' ? 'cloud-check-outline' : sync.state === 'syncing' ? 'cloud-sync-outline'
    : sync.state === 'offline' ? 'cloud-off-outline' : sync.state === 'error' || sync.state === 'blocked' ? 'cloud-alert-outline' : 'cloud-outline';
  const syncDetail = `${STATE_TEXT[sync.state] ?? ''}${pending ? ` · ${pending} waiting` : ''}${sync.message && (sync.state === 'error' || sync.state === 'blocked' || sync.state === 'offline') ? `\n${sync.message.slice(0, 120)}` : ''}`;

  return (
    <View style={{ flex: 1, backgroundColor: brand.bg }}>
      <ScreenHeader title={t('more.title')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 22 }} showsVerticalScrollIndicator={false}>
        {/* Business + plan */}
        <Tap onPress={() => router.push('/settings')} label="Business profile">
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: brand.surface, borderRadius: radius.md, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: brand.line }}>
            <Avatar name={ws?.name ?? '?'} size={52} />
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: brand.ink }} numberOfLines={1}>{ws?.name}</Text>
              <Text style={{ color: brand.muted, fontSize: 13 }} numberOfLines={1}>{ws?.phone || 'Add phone and UPI ID'}{ws?.upiId ? ` · ${ws.upiId}` : ''}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color="#B5B0A4" />
          </View>
        </Tap>

        <Tap onPress={() => router.push('/paywall')} label="Your plan">
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: plan.plan === 'free' ? brand.surface : brand.goldSoft, borderRadius: radius.md, padding: 16, borderWidth: 1, borderColor: plan.plan === 'free' ? brand.line : '#EBCB8B' }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: brand.ink }}>{planName} plan</Text>
                {plan.source === 'founding' ? <ProBadge small plan="business" /> : null}
              </View>
              <Text style={{ color: brand.muted, fontSize: 13, marginTop: 2 }}>
                {plan.source === 'founding' ? 'Founding member · ' : ''}
                {plan.expiresAt ? `until ${new Date(plan.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : plan.plan === 'free' ? 'Compare Free, Pro and Business' : 'Renews in Google Play'}
              </Text>
            </View>
            <Text style={{ color: brand.primary, fontWeight: '800' }}>{plan.plan === 'free' ? 'Upgrade' : 'View'}</Text>
          </View>
        </Tap>

        <ListGroup title="Backup">
          {session ? (
            <ListItem icon={syncIcon} title={session.user.email ?? 'Signed in'} subtitle={syncDetail} onPress={() => syncNow()} />
          ) : (
            <ListItem icon="cloud-upload-outline" title="Sign in to back up" subtitle="Keep your data safe and use it on more than one phone" onPress={() => router.push('/sign-in')} />
          )}
          {session ? <ListItem icon="lock-reset" title="Change password" subtitle="We email you a link" onPress={async () => {
            const { error } = await supabase.auth.resetPasswordForEmail(session.user.email ?? '', { redirectTo: appLink('reset') });
            Alert.alert(error ? 'Could not send the email' : 'Check your email',
              error ? (error.message.toLowerCase().includes('rate') ? 'Too many emails were sent. Please try again in a while.' : error.message) : 'Open the link on this phone to choose a new password.');
          }} /> : null}
          {session ? <ListItem icon="logout" title="Sign out" onPress={() => { setSignOutErr(null); setConfirmSignOut(true); }} /> : null}
        </ListGroup>

        <ListGroup title="Your work">
          <ListItem icon="format-list-bulleted" title={t('more.allWork')} subtitle="Every job, trip and hour, with filters" onPress={() => router.push('/entries')} />
          <ListItem icon="tag-outline" title={t('more.prices')} subtitle="What you charge for, how much, and how it is measured" onPress={() => router.push('/resources')} />
          <ListItem icon="cash-clock" title={t('more.toCollect')} subtitle="Who owes you, with reminders" onPress={() => router.push('/to-collect')} />
          <ListItem icon="file-document-edit-outline" title={t('more.quotes')} subtitle="Price a job first, turn it into a bill"
            right={hasFeature('quotes') ? undefined : <ProBadge small />} onPress={() => router.push('/quotes')} />
          <ListItem icon="receipt" title={t('more.expenses')} subtitle="Fuel, repairs, driver pay — see real profit"
            right={hasFeature('expenses') ? undefined : <ProBadge small />} onPress={() => router.push('/expenses')} />
          <ListItem icon="vector-square" title={t('more.measureField')} subtitle="Walk or drive around a field to get its acres"
            right={hasFeature('field-area') ? undefined : <ProBadge small />} onPress={() => router.push('/field')} />
        </ListGroup>

        <ListGroup title="Team">
          <ListItem icon="account-group-outline" title={t('more.team')} subtitle="Operators and drivers log work on their own phone"
            right={hasFeature('team') ? undefined : <ProBadge small plan="business" />} onPress={() => router.push('/team')} />
          <ListItem icon="account-plus-outline" title="Join a team with a code" subtitle="If your owner gave you a 6-digit code" onPress={() => router.push('/join')} />
        </ListGroup>

        <ListGroup title="Your data">
          <ListItem icon="database-export-outline" title="Back up all data (JSON)" subtitle="Everything on this phone, in one file — free" onPress={() => { void exportAllJson(); }} />
          <ListItem icon="microsoft-excel" iconColor={brand.money} title="Export entries (CSV)" subtitle="Opens in Excel or Google Sheets"
            right={hasFeature('exports') ? undefined : <ProBadge small />}
            onPress={() => (hasFeature('exports') ? exportEntriesCsv() : router.push({ pathname: '/paywall', params: { trigger: 'exports' } }))} />
          <ListItem icon="delete-outline" danger title="Delete my account and data" subtitle="Removes everything here and in the cloud" onPress={() => setConfirmDelete(true)} />
        </ListGroup>
      </ScrollView>

      <Portal>
        <Dialog visible={confirmSignOut} onDismiss={() => setConfirmSignOut(false)} style={{ backgroundColor: '#fff' }}>
          <Dialog.Title>Sign out?</Dialog.Title>
          <Dialog.Content style={{ gap: 8 }}>
            <Text>Signed in as {session?.user.email}. What should happen to the work on this phone?</Text>
            {signOutErr ? <Text style={{ color: brand.danger }}>{signOutErr}</Text> : null}
          </Dialog.Content>
          <Dialog.Actions style={{ flexWrap: 'wrap' }}>
            <Button onPress={() => setConfirmSignOut(false)}>Cancel</Button>
            <Button loading={busy} disabled={busy} onPress={async () => {
              setBusy(true);
              const r = await signOutAccount(true);
              setBusy(false);
              if (r.ok) { setConfirmSignOut(false); router.replace('/welcome'); } else setSignOutErr(r.message ?? 'Could not sign out.');
            }}>Remove data from this phone</Button>
            <Button mode="contained" disabled={busy} onPress={async () => { await signOutAccount(false); setConfirmSignOut(false); }}>Keep my data</Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={confirmDelete} onDismiss={() => setConfirmDelete(false)} style={{ backgroundColor: '#fff' }}>
          <Dialog.Title>Delete everything?</Dialog.Title>
          <Dialog.Content>
            <Text>This permanently deletes your business, customers, entries and bills from this phone{session ? ' and from the cloud' : ''}. It cannot be undone.</Text>
            {err ? <Text style={{ color: brand.danger, marginTop: 8 }}>{err}</Text> : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmDelete(false)}>Keep my data</Button>
            <Button textColor={brand.danger} loading={busy} disabled={busy} onPress={async () => {
              setBusy(true);
              const r = await deleteEverything();
              setBusy(false);
              if (r.ok) { setConfirmDelete(false); router.replace('/welcome'); } else setErr(r.message ?? 'Could not delete.');
            }}>Delete all</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}
