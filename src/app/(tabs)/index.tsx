import React, { useEffect, useRef, useState } from 'react';
import { currencySymbol } from '../../core/region';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Dialog, Modal, Portal, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  adjustStart, earningsByDay, getIncomeGoal, getWorkspace, lastUsed, listBills, listCustomers, listEntries, listResources, listRunning,
  liveAmount, liveSeconds, listSites, listVariants, overdueSummary, previewManual, setIncomeGoal, startTimer, stopTimer, summary,
  togglePause, unbilledSummary, readingKind, getResource, type EntryRow, type ItemInput,
} from '../../db/repo';
import { captureMode, daysFromSeconds, measureOf, UNIT_LABEL, type RateUnit } from '../../core/rate';
import { isGpsTrip, resumeGpsTrip, startGpsTrip, stopGpsTrip, tripFixes, tripKm } from '../../trip/gps';
import { isRunningInExpoGo } from 'expo';
import { t } from '../../i18n';
import { askToConfirm, confirmAvailable } from '../../proof/confirm';
import { distanceWord } from '../../core/region';
import { ItemsEditor, draftsToItems, presetsFor, type ItemDraft } from '../../ui/ItemsEditor';
import { meterHours } from '../../core/gst';
import { useLive, useNow } from '../../ui/hooks';
import { AmountText, Card, EmptyState, FadeIn, Picker, Row, SectionTitle, SourceBadge, Tap } from '../../ui/components';
import { Avatar, InsightCard, Label, LiveDot, ProgressRing, Sparkline, StartButton, StatTile, SummaryCard } from '../../ui/premium';
import { formatClock, formatDuration } from '../../core/time';
import { formatINR, parseRupees } from '../../core/money';
import { getTemplate } from '../../templates/professions';
import { isTimeBased } from '../../core/rate';
import { clearTimerNotifications, scheduleStillWorking, showTimerNotification, uptimeMs } from '../../timer/notification';
import { brand, radius, tabular } from '../../ui/theme';
import { hasFeature } from '../../billing/plan';
import { haptic } from '../../ui/haptics';

const DAY = 86400000;
const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };
const nextMonthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(); };
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? t('greet.morning') : h < 17 ? t('greet.afternoon') : t('greet.evening');
};
const daysAgo = (ms: number) => Math.max(0, Math.floor((Date.now() - ms) / DAY));

export default function Home() {
  const ws = useLive(() => getWorkspace(), []);
  const tpl = getTemplate(ws?.template);
  const resources = useLive(() => listResources(), []);
  const customers = useLive(() => listCustomers(), []);
  const running = useLive(() => listRunning(), []);
  const recent = useLive(() => listEntries({ limit: 20 }), []);
  const today = useLive(() => summary(startOfDay(), startOfDay() + DAY), []);
  const month = useLive(() => summary(monthStart(), nextMonthStart()), []);
  const week = useLive(() => earningsByDay(startOfDay() - 6 * DAY, 7), []);
  const unbilled = useLive(() => unbilledSummary(), []);
  const overdue = useLive(() => overdueSummary(15), []);
  const goal = useLive(() => getIncomeGoal(), []);
  const hasBills = useLive(() => listBills().length > 0, []);
  const now = useNow(running.length > 0);

  const [resId, setResId] = useState<string | null>(null);
  const [variantName, setVariantName] = useState<string | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [custId, setCustId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [asking, setAsking] = useState(false);
  const [noRate, setNoRate] = useState(false);
  const [stopping, setStopping] = useState<EntryRow | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [meterAsk, setMeterAsk] = useState<{ customerId: string | null } | null>(null);
  const inited = useRef(false);
  const variants = useLive(() => (resId ? listVariants(resId) : []), [resId]);
  const sites = useLive(() => (custId ? listSites(custId) : []), [custId]);

  // keep GPS counting a running trip after the app was closed and reopened
  const runningKey = running.map((r) => r.id).join(',');
  useEffect(() => { if (runningKey) void resumeGpsTrip(runningKey.split(',')); }, [runningKey]);

  useEffect(() => {
    if (inited.current || !resources.length) return;
    inited.current = true;
    const last = lastUsed();
    setResId(resources.find((r) => r.id === last.resourceId)?.id ?? resources[0].id);
    setCustId(last.customerId);
  }, [resources]);

  if (!ws) return null;
  const res = resources.find((r) => r.id === resId);
  const cust = customers.find((c) => c.id === custId);
  const canStart = !!res && !running.map((r) => r.resourceId).includes(res.id);

  // live money from running timers counts toward today
  const liveToday = running.reduce((s, e) => s + liveAmount(e as any, now), 0);
  const earnedToday = today.earnedPaise + liveToday;
  const weekTotal = week.reduce((a, b) => a + b, 0) + liveToday;
  const monthEarned = month.earnedPaise + liveToday;

  // How the selected work is captured: a timer, an odometer trip, or just a count (no timer)
  const selRate = res ? previewManual({ resourceId: res.id, customerId: custId, variantName, workedSeconds: 0, breakSeconds: 0 }).rate : null;
  const measure = selRate ? measureOf(selRate) : 'timer';
  const mode = selRate ? captureMode(selRate.unit, measure) : 'timer';
  const reading = readingKind(res, selRate?.unit, selRate?.measure);
  const gps = measure === 'gps';
  const unitWord = selRate ? UNIT_LABEL[selRate.unit] : null;

  const begin = async (customerId: string | null, meterStart?: number | null) => {
    if (!res) return;
    // Odometer (km) or hour meter (machines): ask for the reading first, then start
    if (reading && meterStart === undefined) { setMeterAsk({ customerId }); return; }
    const who = customers.find((c) => c.id === customerId);
    const entryId = startTimer(ws.id, { resourceId: res.id, customerId, variantName, siteId: customerId === custId ? siteId : null, uptimeMs: await uptimeMs(), meterStart: meterStart ?? null });
    haptic.success();
    if (gps) {
      const g = await startGpsTrip(entryId);
      if (!g.ok) Alert.alert('GPS is off for this trip', g.message);
    }
    await showTimerNotification(`${res.name}${who ? ' · ' + who.name : ''}`, Date.now());
    await scheduleStillWorking(8);
  };
  // Start needs: a rate (otherwise the bill would be ₹0) and someone to bill (or an explicit "no customer").
  const start = () => {
    if (!res) return;
    if (running.length > 0 && !hasFeature('multi-timer')) { router.push({ pathname: '/paywall', params: { trigger: 'multi-timer' } }); return; }
    if (!selRate) { setNoRate(true); return; }
    if (!custId) { setAsking(true); return; }
    void begin(custId);
  };
  // Count units (job, trip, acre, piece, session, shift): no timer, log how many
  const logCount = () => router.push({ pathname: '/entry/new', params: { resourceId: resId ?? '', customerId: custId ?? '' } });

  // guided first-bill steps
  const steps = [
    { label: `Add a ${tpl.customerWord.toLowerCase()}`, hint: 'Pick someone from your contacts', done: customers.length > 0, go: () => router.push('/customer/new') },
    { label: 'Log some work', hint: 'Tap the big Start button', done: recent.length > 0 || running.length > 0, go: () => {} },
    { label: 'Send your first bill', hint: 'Bills tab → Create bill → WhatsApp', done: hasBills, go: () => router.push('/bills') },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);

  return (
    <View style={{ flex: 1, backgroundColor: brand.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* ---------- Header ---------- */}
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: brand.muted, fontSize: 14 }}>{greeting()}</Text>
              <Text style={{ color: brand.ink, fontSize: 24, fontWeight: '800', letterSpacing: -0.3 }} numberOfLines={1}>{ws.name}</Text>
            </View>
            <Tap onPress={() => router.push('/settings')} label="Business profile">
              <Avatar name={ws.name} size={42} />
            </Tap>
          </View>
        </SafeAreaView>

        <View style={{ padding: 20, paddingTop: 16, gap: 16 }}>
          {/* ---------- Today summary ---------- */}
          <SummaryCard>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Label dark>{t('home.earnedToday')}</Label>
                <Text style={[tabular, { color: '#fff', fontSize: 36, fontWeight: '800', letterSpacing: -0.8, marginTop: 2 }]} numberOfLines={1} adjustsFontSizeToFit>
                  {formatINR(earnedToday)}
                </Text>
                <Text style={{ color: brand.onDarkMuted, marginTop: 2 }}>
                  {t('home.worked', { time: formatDuration(today.seconds) })}{running.length ? ` · ${t('home.timerRunning')}` : ''}
                </Text>
              </View>
              {goal > 0 ? (
                <Tap onPress={() => setGoalOpen(true)} label="Monthly goal">
                  <ProgressRing progress={monthEarned / goal} size={70}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{Math.min(999, Math.round((monthEarned / goal) * 100))}%</Text>
                  </ProgressRing>
                  <Text style={{ color: brand.onDarkMuted, fontSize: 11, textAlign: 'center', marginTop: 4 }}>month goal</Text>
                </Tap>
              ) : (
                <Tap onPress={() => setGoalOpen(true)} label="Set a monthly goal">
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.12)' }}>
                    <MaterialCommunityIcons name="flag-outline" size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', marginLeft: 4 }}>Set goal</Text>
                  </View>
                </Tap>
              )}
            </View>
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 16 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: brand.onDarkMuted, fontSize: 12 }}>Last 7 days</Text>
                <Text style={[tabular, { color: '#fff', fontSize: 17, fontWeight: '800' }]} numberOfLines={1}>{formatINR(weekTotal)}</Text>
              </View>
              <Sparkline data={[...week.slice(0, 6), week[6] + liveToday]} width={110} height={34} color="rgba(255,255,255,0.9)" />
            </View>
          </SummaryCard>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <StatTile icon="calendar-month-outline" label={t('home.thisMonth')} value={formatINR(monthEarned)} onPress={() => router.push('/reports')} />
            <StatTile icon="cash-clock" accent={brand.pending} label={t('home.toCollect')} value={formatINR(today.pendingPaise)} onPress={() => router.push('/to-collect')} />
          </View>
          {/* ---------- Running timers ---------- */}
          {running.map((e) => (
            <FadeIn key={e.id}>
              <SummaryCard tone="running">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <LiveDot />
                  <Text style={{ color: '#6EE7B7', fontWeight: '800', fontSize: 12, letterSpacing: 1 }}>{e.pauseStartedAt ? t('run.break') : t('run.running')}</Text>
                  <View style={{ flex: 1 }} />
                  {e.pauseStartedAt ? null : <SourceBadge source={e.source} light />}
                </View>
                <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 8 }} numberOfLines={1}>
                  {e.resourceName}{e.customerName ? ` · ${e.customerName}` : ''}
                </Text>
                {e.meterStart != null ? (
                  <Text style={{ color: brand.onDarkMuted, marginTop: 2 }}>
                    {e.unit === 'km' ? 'Odometer' : 'Meter'} at start: {e.meterStart} · enter the end reading when you stop
                  </Text>
                ) : null}
                <Text style={[tabular, { color: '#fff', fontSize: 54, fontWeight: '800', marginVertical: 4, letterSpacing: -1 }]}>
                  {formatClock(liveSeconds(e, now))}
                </Text>
                {isGpsTrip(e.id) ? (
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                      <MaterialCommunityIcons name="map-marker-distance" size={18} color="#6EE7B7" />
                      <Text style={[tabular, { color: '#fff', fontSize: 22, fontWeight: '800', marginLeft: 6 }]}>{tripKm(e.id).toFixed(1)} km</Text>
                      <Text style={{ color: brand.onDarkMuted, marginLeft: 6 }}>counted by GPS</Text>
                    </View>
                    <Text style={{ color: brand.onDarkMuted, fontSize: 12, marginTop: 2 }}>
                      {tripFixes(e.id) === 0 && now - e.startedAt > 60000 ? 'No GPS signal yet — go outdoors or check that location is on. ' : ''}
                      {isRunningInExpoGo() ? 'Keep this app open while driving (test version).' : 'Counts even with the screen off.'}
                    </Text>
                  </View>
                ) : e.unit === 'hour' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                    <AmountText paise={liveAmount(e as any, now)} style={{ color: '#fff', fontSize: 22 }} />
                    <Text style={{ color: brand.onDarkMuted, marginLeft: 6 }}>so far</Text>
                  </View>
                ) : (
                  <Text style={{ color: brand.onDarkMuted }}>
                    {e.unit === 'km' ? 'Amount is worked out from the km when the trip ends' : e.unit === 'day'
                      ? `Day ${daysFromSeconds((now - e.startedAt) / 1000)} of the rental` : 'Amount is worked out when you stop'}
                  </Text>
                )}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                  <Button mode="contained" buttonColor="rgba(255,255,255,0.16)" textColor="#fff" icon={e.pauseStartedAt ? 'play' : 'coffee-outline'}
                    onPress={() => { haptic.press(); togglePause(e.id); }} style={{ flex: 1, borderRadius: radius.pill }} contentStyle={{ minHeight: 52 }}>
                    {e.pauseStartedAt ? t('run.resume') : t('run.breakBtn')}
                  </Button>
                  <Button mode="contained" buttonColor="#fff" textColor={brand.primaryDeep} icon="stop-circle"
                    onPress={() => { haptic.press(); setStopping(e); }} style={{ flex: 1.3, borderRadius: radius.pill }} contentStyle={{ minHeight: 52 }} labelStyle={{ fontWeight: '800', fontSize: 16 }}>
                    Stop
                  </Button>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                  <Text style={{ color: brand.onDarkMuted, marginRight: 4 }}>{t('run.startedLate')}</Text>
                  {[5, 15].map((m) => (
                    <Button key={m} compact textColor="#fff" onPress={() => { haptic.tap(); adjustStart(e.id, m); }}>+{m} min</Button>
                  ))}
                </View>
              </SummaryCard>
            </FadeIn>
          ))}

          {/* ---------- Start ---------- */}
          {resources.length === 0 ? (
            <EmptyState text={`Add a ${tpl.resourceWord.toLowerCase()} and its price to start.`} action="Add" onAction={() => router.push('/resources')} />
          ) : (
            <FadeIn delay={60}>
              <Card style={{ alignItems: 'center', paddingVertical: 18, borderRadius: radius.xl }}>
                {mode === 'count' ? (
                  <>
                    <Tap onPress={() => { haptic.press(); logCount(); }} label={`Log ${unitWord?.many ?? 'work'}`}>
                      <View style={{ width: 152, height: 152, borderRadius: 76, backgroundColor: brand.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                        <View style={{ width: 132, height: 132, borderRadius: 66, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center' }}>
                          <MaterialCommunityIcons name="plus" size={52} color="#fff" />
                          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 1 }}>LOG</Text>
                        </View>
                      </View>
                    </Tap>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: brand.ink, marginTop: 10 }}>{t('home.log', { what: unitWord?.many ?? 'work' })}</Text>
                    <Text style={{ fontSize: 13, color: brand.muted, marginTop: 2 }}>{t('home.noTimer', { unit: unitWord?.one ?? '' })}</Text>
                  </>
                ) : (
                  <>
                    <StartButton onPress={start} disabled={!canStart} label={`Start ${res?.name ?? ''}`} />
                    <Text style={{ fontSize: 16, fontWeight: '700', color: canStart ? brand.ink : brand.muted, marginTop: 10 }}>
                      {!canStart ? t('home.alreadyRunning') : mode === 'odometer' ? t('home.startTrip') : selRate?.unit === 'day' ? t('home.startRental') : t('home.startWork')}
                    </Text>
                    {canStart && selRate ? (
                      <Text style={{ fontSize: 13, color: brand.muted, marginTop: 2, textAlign: 'center', paddingHorizontal: 16 }}>
                        {gps ? t('home.gpsHint', { dist: distanceWord() })
                          : measure === 'odometer' ? t('home.odoHint', { dist: distanceWord() })
                            : reading === 'hourmeter' ? t('home.meterHint')
                              : selRate.unit === 'day' ? t('home.dayHint')
                                : t('home.timerHint')}
                      </Text>
                    ) : null}
                  </>
                )}
                <Tap onPress={() => { haptic.tap(); setPicking(true); }} label="Change what you are working on" style={{ marginTop: 12, alignSelf: 'stretch', marginHorizontal: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: brand.tint, borderRadius: radius.pill, paddingVertical: 12, paddingHorizontal: 16 }}>
                    <MaterialCommunityIcons name="briefcase-variant-outline" size={18} color={brand.primary} />
                    <Text style={{ marginHorizontal: 8, color: brand.ink, flex: 1, fontWeight: '600' }} numberOfLines={1}>
                      {res?.name}{cust ? `  ›  ${cust.name}` : `  ›  no ${tpl.customerWord.toLowerCase()}`}
                    </Text>
                    <Text style={{ color: brand.primary, fontWeight: '800' }}>{t('home.change')}</Text>
                  </View>
                </Tap>
                {mode !== 'count' ? (
                  <Button icon="clock-plus-outline" onPress={logCount} style={{ marginTop: 6 }}>
                    {mode === 'odometer' ? t('home.pastTrip') : t('home.forgot')}
                  </Button>
                ) : null}
              </Card>
            </FadeIn>
          )}

          {/* ---------- Money nudges ---------- */}
          {unbilled.totalPaise > 0 ? (
            <FadeIn delay={100}>
              <InsightCard icon="file-document-edit-outline" tone="gold"
                title={t('home.unbilled', { amount: formatINR(unbilled.totalPaise) })}
                body={`${unbilled.entries} ${unbilled.entries === 1 ? 'entry' : 'entries'} for ${unbilled.customers} ${unbilled.customers === 1 ? tpl.customerWord.toLowerCase() : 'people'}${unbilled.oldestAt ? ` · oldest ${daysAgo(unbilled.oldestAt)} days ago` : ''}`}
                action={t('home.billNow')} onPress={() => router.push('/bills')} />
            </FadeIn>
          ) : null}
          {overdue.customers > 0 ? (
            <FadeIn delay={130}>
              <InsightCard icon="alarm-light-outline" tone="danger"
                title={t('home.overdue', { amount: formatINR(overdue.totalPaise) })}
                body={`${overdue.customers} ${overdue.customers === 1 ? 'person has' : 'people have'} owed you for more than 15 days`}
                action={t('home.remind')} onPress={() => router.push('/to-collect')} />
            </FadeIn>
          ) : null}

          {/* ---------- First-bill checklist ---------- */}
          {doneCount < steps.length ? (
            <FadeIn delay={150}>
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text variant="titleMedium" style={{ fontWeight: '800', color: brand.ink }}>Get your first bill out</Text>
                  <Text style={{ color: brand.muted, fontWeight: '700' }}>{doneCount}/{steps.length}</Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: brand.line, marginVertical: 12, overflow: 'hidden' }}>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: brand.primary, width: `${Math.max(4, (doneCount / steps.length) * 100)}%` }} />
                </View>
                {steps.map((s) => (
                  <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
                    <MaterialCommunityIcons name={s.done ? 'check-circle' : 'circle-outline'} size={24} color={s.done ? brand.money : brand.muted} />
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={{ fontSize: 16, color: brand.ink, textDecorationLine: s.done ? 'line-through' : 'none', opacity: s.done ? 0.55 : 1 }}>{s.label}</Text>
                      {!s.done && s === next ? <Text style={{ fontSize: 13, color: brand.muted }}>{s.hint}</Text> : null}
                    </View>
                  </View>
                ))}
                {next && next.label !== steps[1].label ? (
                  <Button mode="contained" onPress={next.go} style={{ marginTop: 10, borderRadius: radius.pill }} contentStyle={{ minHeight: 48 }}>{next.label}</Button>
                ) : null}
              </Card>
            </FadeIn>
          ) : null}

          {/* ---------- Recent work ---------- */}
          <SectionTitle action={t('home.seeAll')} onAction={() => router.push('/entries')}>{t('home.recent')}</SectionTitle>
          {recent.length === 0 ? (
            <EmptyState icon="timer-sand" text="Nothing logged yet. Your work will show up here." />
          ) : (
            <View>
              {recent.slice(0, 6).map((e) => (
                <Row
                  flush key={e.id} icon={e.source === 'live' ? 'timer-outline' : 'pencil-outline'}
                  title={`${e.resourceName}${e.customerName ? ' · ' + e.customerName : ''}`}
                  subtitle={`${new Date(e.startedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · ${e.unit === 'hour' ? formatDuration(e.billableSeconds) : `${e.quantity ?? 1} ${UNIT_LABEL[e.unit]?.[(e.quantity ?? 1) === 1 ? 'one' : 'many'] ?? e.unit}`}${e.operatorName ? ' · by ' + e.operatorName : ''}${e.confirmationStatus === 'confirmed' ? ' · ✓ confirmed' : ''}${e.status === 'billed' ? ' · Billed' : ''}`}
                  right={<AmountText paise={e.amountPaise + e.itemsPaise} tone={e.status === 'billed' ? 'plain' : 'received'} />}
                  onPress={() => router.push(`/entry/${e.id}`)}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Who is this work for? (shown when Start is tapped with no customer) */}
      <Portal>
        <Modal visible={asking} onDismiss={() => setAsking(false)} contentContainerStyle={{ backgroundColor: '#fff', margin: 20, padding: 20, borderRadius: radius.lg, gap: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '800' }}>Who is this work for?</Text>
          {customers.length === 0 ? <Text style={{ color: brand.muted }}>You have not added any {tpl.customerWord.toLowerCase()} yet.</Text> : (
            <Picker items={customers} selected={null} onSelect={(id) => { setCustId(id); setAsking(false); void begin(id); }} label={(c) => c.name} />
          )}
          <Button mode="contained" icon="plus" onPress={() => { setAsking(false); router.push('/customer/new'); }} contentStyle={{ minHeight: 48 }}>New {tpl.customerWord.toLowerCase()}</Button>
          <Button onPress={() => { setAsking(false); void begin(null); }} textColor={brand.muted}>Start without one for now</Button>
        </Modal>
        <Dialog visible={noRate} onDismiss={() => setNoRate(false)} style={{ backgroundColor: '#fff', borderRadius: radius.lg }}>
          <Dialog.Title>Set your price first</Dialog.Title>
          <Dialog.Content><Text>There is no price for {res?.name} yet. Without one the bill would be {formatINR(0)}.</Text></Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setNoRate(false)}>Cancel</Button>
            <Button mode="contained" onPress={() => { setNoRate(false); router.push('/resources'); }}>Set a price</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Change resource / customer */}
      <Portal>
        <Modal visible={picking} onDismiss={() => setPicking(false)} contentContainerStyle={{ backgroundColor: '#fff', margin: 20, padding: 20, borderRadius: radius.lg, gap: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '800' }}>What are you working on?</Text>
          <Picker items={resources} selected={resId} onSelect={(id) => { setResId(id); setVariantName(null); }} label={(r) => r.name} />
          <Text style={{ fontSize: 16, fontWeight: '700', marginTop: 6 }}>For which {tpl.customerWord.toLowerCase()}?</Text>
          <Picker items={[{ id: '', name: 'No one yet' } as any, ...customers]} selected={custId ?? ''} onSelect={(id) => { setCustId(id || null); setSiteId(null); }} label={(c: any) => c.name} />
          {variants.length > 0 ? (
            <>
              <Text style={{ fontSize: 16, fontWeight: '700', marginTop: 6 }}>Type of work</Text>
              <Picker items={[{ id: '', name: 'Standard' } as any, ...variants.map((v) => ({ id: v, name: v }))]} selected={variantName ?? ''} onSelect={(id) => setVariantName(id || null)} label={(v: any) => v.name} />
            </>
          ) : null}
          {sites.length > 0 ? (
            <>
              <Text style={{ fontSize: 16, fontWeight: '700', marginTop: 6 }}>Site or project</Text>
              <Picker items={[{ id: '', name: 'None' } as any, ...sites]} selected={siteId ?? ''} onSelect={(id) => setSiteId(id || null)} label={(x: any) => x.name} />
            </>
          ) : null}
          <Button icon="plus" onPress={() => { setPicking(false); router.push('/customer/new'); }}>New {tpl.customerWord.toLowerCase()}</Button>
          <Button mode="contained" onPress={() => setPicking(false)} contentStyle={{ minHeight: 48 }}>Done</Button>
        </Modal>
      </Portal>

      <GoalDialog visible={goalOpen} current={goal} onClose={() => setGoalOpen(false)} />

      <MeterStartDialog
        visible={!!meterAsk} machine={res?.name ?? ''} last={res?.meterReading ?? null} kind={reading ?? 'hourmeter'}
        onCancel={() => setMeterAsk(null)}
        onStart={(reading) => { const c = meterAsk?.customerId ?? null; setMeterAsk(null); void begin(c, reading); }}
      />

      <StopDialog
        entry={stopping}
        onClose={() => setStopping(null)}
        onSave={async (opts) => {
          if (!stopping) return;
          const g = isGpsTrip(stopping.id) ? await stopGpsTrip(stopping.id) : null;
          const stoppedId = stopping.id;
          stopTimer(stoppedId, { uptimeMs: await uptimeMs(), ...opts, gpsKm: g?.km ?? null, gpsFrom: g?.from ?? null, gpsTo: g?.to ?? null });
          // Proof: offer to send the customer a confirm link right away
          if (confirmAvailable() && stopping.customerId) {
            Alert.alert(t('confirm.ask'), 'Send a link on WhatsApp so the customer can confirm this work. Confirmed work is shown on the bill.', [
              { text: 'Not now', style: 'cancel' },
              { text: 'Send link', onPress: () => { void askToConfirm(stoppedId).then((r) => { if (!r.ok) Alert.alert('Could not send', r.message); }); } },
            ]);
          }
          haptic.success();
          setStopping(null);
          if (listRunning().length === 0) await clearTimerNotifications();
        }}
      />
    </View>
  );
}

function GoalDialog({ visible, current, onClose }: { visible: boolean; current: number; onClose: () => void }) {
  const [v, setV] = useState('');
  useEffect(() => { if (visible) setV(current ? String(current / 100) : ''); }, [visible, current]);
  const p = parseRupees(v);
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onClose} style={{ backgroundColor: '#fff', borderRadius: radius.lg }}>
        <Dialog.Title>Monthly income goal</Dialog.Title>
        <Dialog.Content style={{ gap: 10 }}>
          <Text style={{ color: brand.muted }}>How much do you want to earn this month? Home shows how close you are.</Text>
          <TextInput mode="outlined" label={`Goal ${currencySymbol()}`} value={v} onChangeText={setV} keyboardType="number-pad" autoFocus />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {[20000, 50000, 100000].map((g) => (
              <Button key={g} compact mode="outlined" onPress={() => setV(String(g))}>{formatINR(g * 100)}</Button>
            ))}
          </View>
        </Dialog.Content>
        <Dialog.Actions>
          {current ? <Button textColor={brand.danger} onPress={() => { setIncomeGoal(0); onClose(); }}>Remove</Button> : null}
          <Button onPress={onClose}>Cancel</Button>
          <Button mode="contained" disabled={!p} onPress={() => { setIncomeGoal(p!); haptic.success(); onClose(); }}>Save</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

function MeterStartDialog({ visible, machine, last, kind, onCancel, onStart }: {
  visible: boolean; machine: string; last: number | null; kind: 'odometer' | 'hourmeter'; onCancel: () => void; onStart: (reading: number | null) => void;
}) {
  const [v, setV] = useState('');
  useEffect(() => { if (visible) setV(last != null ? String(last) : ''); }, [visible, last]);
  const n = v.trim() ? parseFloat(v) : null;
  const bad = n !== null && (!isFinite(n) || n < 0);
  const odo = kind === 'odometer';
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onCancel} style={{ backgroundColor: '#fff', borderRadius: radius.lg }}>
        <Dialog.Title>{odo ? `Km on ${machine}'s dashboard` : `Hours counter on ${machine}`}</Dialog.Title>
        <Dialog.Content style={{ gap: 10 }}>
          <Text style={{ color: brand.muted }}>
            {odo ? 'Look at the total km shown on the dashboard and type it. At the end you type it again, and the bill uses the difference.'
              : 'Look at the hours number shown on the machine and type it. At the end you type it again, and the bill uses the difference.'}
          </Text>
          <TextInput mode="outlined" label={odo ? 'Km on the dashboard now' : 'Hours on the machine now'} value={v} onChangeText={setV} keyboardType="decimal-pad" autoFocus error={bad}
            right={<TextInput.Icon icon={odo ? 'counter' : 'gauge'} />} />
          {last != null ? <Text style={{ color: brand.muted, fontSize: 13 }}>Last reading was {last}.</Text> : null}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={() => onStart(null)}>{odo ? 'Skip, type km at the end' : 'Skip, use the clock'}</Button>
          <Button mode="contained" disabled={n === null || bad} onPress={() => onStart(n)}>Start</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

function StopDialog({ entry, onClose, onSave }: {
  entry: EntryRow | null; onClose: () => void;
  onSave: (o: { minutesAgo?: number; quantity?: number | null; note?: string | null; meterEnd?: number | null; items?: ItemInput[] }) => void;
}) {
  const [note, setNote] = useState('');
  const [qty, setQty] = useState('1');
  const [ago, setAgo] = useState(0);
  const [mEnd, setMEnd] = useState('');
  const [drafts, setDrafts] = useState<ItemDraft[]>([]);
  const snap = entry?.rateSnapshot ? JSON.parse(entry.rateSnapshot) : null;
  const unit: string = snap?.unit ?? 'hour';
  const quantityBased = snap && !isTimeBased(snap.unit);
  const hasMeter = entry?.meterStart != null;
  const odo = unit === 'km';
  const endVal = mEnd.trim() ? parseFloat(mEnd) : null;
  const mh = hasMeter ? meterHours(entry!.meterStart, endVal) : null;
  const meterBad = hasMeter && endVal !== null && mh === null;
  const elapsedSecs = entry ? Math.max(0, (Date.now() - entry.startedAt) / 1000) : 0;
  // Day rentals: suggest the number of days from how long it was out (any started day counts)
  const gpsOn = !!entry && isGpsTrip(entry.id);
  const gpsKmNow = entry && gpsOn ? tripKm(entry.id) : null;
  useEffect(() => {
    setNote(''); setAgo(0); setMEnd(''); setDrafts([]);
    setQty(entry && unit === 'day' ? String(daysFromSeconds((Date.now() - entry.startedAt) / 1000))
      : entry && unit === 'km' && isGpsTrip(entry.id) ? String(tripKm(entry.id)) : '1');
  }, [entry?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const clockHours = entry ? liveSeconds(entry) / 3600 : 0;
  const showQty = quantityBased && !(odo && mh !== null);
  return (
    <Portal>
      <Dialog visible={!!entry} onDismiss={onClose} style={{ backgroundColor: '#fff', borderRadius: radius.lg, maxHeight: '88%' }}>
        <Dialog.Title>{t('stop.title')}</Dialog.Title>
        <Dialog.ScrollArea style={{ paddingHorizontal: 24 }}>
          <ScrollView contentContainerStyle={{ gap: 12, paddingVertical: 8 }} keyboardShouldPersistTaps="handled">
            {hasMeter ? (
              <>
                <TextInput mode="outlined" label={`${odo ? 'Km on the dashboard now' : 'Hours on the machine now'} (was ${entry!.meterStart})`} value={mEnd} onChangeText={setMEnd}
                  keyboardType="decimal-pad" error={meterBad} right={<TextInput.Icon icon={odo ? 'counter' : 'gauge'} />} />
                <Text style={{ color: meterBad ? brand.danger : brand.muted, fontSize: 13 }}>
                  {meterBad ? 'The end reading must be higher than the start.'
                    : mh !== null
                      ? (odo ? `${mh} km driven${snap?.minQuantity && mh < snap.minQuantity ? ` · minimum ${snap.minQuantity} km will be billed` : ''}`
                        : `${mh} h on the meter · ${clockHours.toFixed(1)} h on the clock${Math.abs(mh - clockHours) > Math.max(0.5, clockHours * 0.3) ? ' — check the reading' : ''}`)
                      : odo ? 'Or type the km below.' : 'Leave empty to bill by the clock.'}
                </Text>
              </>
            ) : null}
            {showQty ? (
              <>
                <TextInput mode="outlined" label={unit === 'km' ? 'Km driven' : `How many ${UNIT_LABEL[unit as RateUnit]?.many ?? unit}?`} value={qty} onChangeText={setQty} keyboardType="decimal-pad" />
                {gpsOn ? (
                  <Text style={{ color: brand.muted, fontSize: 13 }}>
                    GPS counted {gpsKmNow?.toFixed(1)} km. If the signal dropped, correct it from the dashboard km.
                  </Text>
                ) : null}
                {unit === 'day' ? (
                  <Text style={{ color: brand.muted, fontSize: 13 }}>Out for {formatDuration(elapsedSecs)}. Any started day counts — change it if you agreed otherwise.</Text>
                ) : null}
                {snap?.minQuantity && (parseFloat(qty) || 0) > 0 && (parseFloat(qty) || 0) < snap.minQuantity ? (
                  <Text style={{ color: brand.muted, fontSize: 13 }}>Minimum {snap.minQuantity} {UNIT_LABEL[unit as RateUnit]?.many ?? unit} will be billed.</Text>
                ) : null}
              </>
            ) : null}
            {!mh || odo ? (
              <>
                <Text style={{ color: brand.muted }}>{t('stop.whenStop')}</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {[0, 5, 10, 15].map((m) => (
                    <Button key={m} mode={ago === m ? 'contained' : 'outlined'} compact onPress={() => setAgo(m)}>{m === 0 ? t('stop.justNow') : t('stop.minAgo', { n: m })}</Button>
                  ))}
                </View>
              </>
            ) : null}
            <ItemsEditor drafts={drafts} onChange={setDrafts} presets={presetsFor(unit, entry ? getResource(entry.resourceId)?.kind : null)} />
            <TextInput mode="outlined" label="Note (optional)" value={note} onChangeText={setNote} />
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onClose}>{t('stop.keep')}</Button>
          <Button mode="contained" disabled={meterBad} onPress={() => onSave({
            minutesAgo: ago || undefined, quantity: showQty ? parseFloat(qty) || 1 : null, note: note || null,
            meterEnd: mh !== null ? endVal : null, items: draftsToItems(drafts),
          })}>Save</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
