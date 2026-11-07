import React, { useEffect, useState } from 'react';
import { LANGS, currentLang, setLang, t as tx, type Lang } from '../i18n';
import { ScrollView, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TEMPLATES } from '../templates/professions';
import { FadeIn, IconBubble, Tap } from '../ui/components';
import { brand, radius } from '../ui/theme';
import { getWorkspace } from '../db/repo';
import { useLive } from '../ui/hooks';

// ON-1. Sign-in (ON-2: Google or email) lives in sign-in.tsx; Phase 1 works fully offline.
export default function Welcome() {
  // After signing in on a new phone the business arrives from the cloud: leave this screen for Home.
  const ws = useLive(() => getWorkspace(), []);
  useEffect(() => { if (ws) router.replace('/'); }, [ws]);
  const [lang, setLangState] = useState<Lang>(currentLang());
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: brand.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <FadeIn>
          <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <MaterialCommunityIcons name="timer-sand" size={28} color="#fff" />
          </View>
          <Text style={{ fontSize: 15, fontWeight: '800', color: brand.primary, letterSpacing: 1, marginBottom: 6 }}>HIRELOG</Text>
          <Text style={{ fontSize: 30, lineHeight: 38, fontWeight: '800', color: brand.ink }}>{tx('welcome.title')}</Text>
          <Text style={{ fontSize: 16, lineHeight: 24, color: brand.muted, marginTop: 8 }}>{tx('welcome.body')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            {LANGS.map((l) => (
              <Button key={l.id} compact mode={lang === l.id ? 'contained' : 'outlined'} onPress={() => { setLang(l.id); setLangState(l.id); }}>{l.name}</Button>
            ))}
          </View>
          <Button mode="outlined" icon="login" onPress={() => router.push({ pathname: '/sign-in', params: { mode: 'in' } })} style={{ marginTop: 16, alignSelf: 'flex-start' }}>
            {tx('welcome.have')}
          </Button>
        </FadeIn>

        <FadeIn delay={120}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: brand.ink, marginTop: 32, marginBottom: 14 }}>{tx('welcome.what')}</Text>
        </FadeIn>

        <View style={{ gap: 12 }}>
          {TEMPLATES.map((t, i) => (
            <FadeIn key={t.id} delay={160 + i * 50}>
              <Tap onPress={() => router.push({ pathname: '/setup', params: { template: t.id, lang } })} label={t.title}>
                <View style={{ backgroundColor: brand.surface, borderRadius: radius.md, padding: 16, borderWidth: 1, borderColor: brand.line }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <IconBubble icon={t.icon} size={46} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ fontSize: 17, fontWeight: '800', color: brand.ink }}>{t.short}</Text>
                      <Text numberOfLines={1} style={{ fontSize: 13, color: brand.muted, marginTop: 1 }}>{t.examples}</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={22} color="#B5B0A4" />
                  </View>
                  <View style={{ marginTop: 12, gap: 6 }}>
                    {t.highlights.map((h) => (
                      <View key={h} style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <MaterialCommunityIcons name="check" size={16} color={brand.money} />
                        <Text style={{ marginLeft: 8, color: brand.ink, fontSize: 14 }}>{h}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </Tap>
            </FadeIn>
          ))}
        </View>
        <Text style={{ textAlign: 'center', color: brand.muted, marginTop: 24, fontSize: 13 }}>
          More kinds of work (tutors, drivers, labour, rooms) are coming later.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
