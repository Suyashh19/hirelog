import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { router } from 'expo-router';
import { useSession } from '../cloud';
import { createInvite, listMembers, type Member } from '../data/team';
import { isOperator } from '../data/membership';
import { hasFeature } from '../billing/plan';
import { getWorkspace } from '../db/repo';
import { openWhatsApp } from '../bills/share';
import { Avatar, ListGroup, ListItem, ProBadge } from '../ui/premium';
import { brand, radius } from '../ui/theme';

/** Owner: invite operators/drivers with a 6-digit code and see who is in the team (Business). */
export default function Team() {
  const session = useSession();
  const [members, setMembers] = useState<Member[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [seeAmounts, setSeeAmounts] = useState(false);
  const [busy, setBusy] = useState(false);
  const allowed = hasFeature('team');

  useEffect(() => { if (session) void listMembers().then(setMembers); }, [session, code]);

  if (isOperator()) {
    return <View style={{ padding: 24 }}><Text>You are a team member of {getWorkspace()?.name}. Only the owner manages the team.</Text></View>;
  }

  const invite = async () => {
    if (!allowed) { router.push({ pathname: '/paywall', params: { trigger: 'team' } }); return; }
    setBusy(true); setMsg(null);
    const r = await createInvite('member', seeAmounts);
    setBusy(false);
    if (r.ok) setCode(r.code); else setMsg(r.message);
  };
  const share = () => {
    if (!code) return;
    void openWhatsApp(null, [
      `Join ${getWorkspace()?.name ?? 'our business'} on HireLog:`,
      '1. Install HireLog from the Play Store',
      '2. Sign in (More → Sign in to back up)',
      `3. More → Join a team with a code → ${code}`,
      'The code works for 7 days.',
    ].join('\n'));
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
      <Text style={{ color: brand.muted }}>
        Operators and drivers log work on their own phone — start, stop, hours counter, GPS trips, photos. You see everything here and bill it.
      </Text>
      {!session ? (
        <Button mode="contained" icon="login" onPress={() => router.push('/sign-in')}>Sign in first</Button>
      ) : (
        <>
          <View style={{ backgroundColor: brand.surface, borderRadius: radius.md, borderWidth: 1, borderColor: brand.line, padding: 16, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, fontWeight: '800', fontSize: 16, color: brand.ink }}>Invite an operator or driver</Text>
              {!allowed ? <ProBadge small plan="business" /> : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button compact mode={!seeAmounts ? 'contained' : 'outlined'} onPress={() => setSeeAmounts(false)}>Hide money from them</Button>
              <Button compact mode={seeAmounts ? 'contained' : 'outlined'} onPress={() => setSeeAmounts(true)}>Can see amounts</Button>
            </View>
            {code ? (
              <>
                <Text style={{ fontSize: 40, fontWeight: '800', letterSpacing: 8, textAlign: 'center', color: brand.primary }}>{code}</Text>
                <Text style={{ color: brand.muted, textAlign: 'center' }}>Valid for 7 days, one person.</Text>
                <Button mode="contained" icon="whatsapp" onPress={share}>Send the code on WhatsApp</Button>
              </>
            ) : (
              <Button mode="contained" icon="account-plus" loading={busy} disabled={busy} onPress={invite}>Make an invite code</Button>
            )}
            {msg ? <Text style={{ color: brand.danger }}>{msg}</Text> : null}
          </View>

          <ListGroup title={`Team (${members.length})`}>
            {members.length === 0 ? <ListItem icon="account-outline" title="Just you so far" /> : null}
            {members.map((m) => (
              <ListItem key={m.userId} left={<Avatar name={m.email} />} title={m.email}
                subtitle={`${m.role === 'owner' ? 'Owner' : m.role === 'manager' ? 'Manager' : 'Operator'}${m.role === 'member' ? (m.canSeeAmounts ? ' · sees amounts' : ' · money hidden') : ''}`} />
            ))}
          </ListGroup>
        </>
      )}
    </ScrollView>
  );
}
