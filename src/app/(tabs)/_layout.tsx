import React from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLive } from '../../ui/hooks';
import { getWorkspace } from '../../db/repo';
import { getTemplate, plural } from '../../templates/professions';
import { brand } from '../../ui/theme';
import { haptic } from '../../ui/haptics';
import { currentLang, t } from '../../i18n';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const ws = useLive(() => getWorkspace(), []);
  const customerWord = getTemplate(ws?.template).customerWord;
  const icon = (name: string, active: string) => {
    const TabIcon = ({ color, focused }: { color: any; focused: boolean }) => (
      <View style={{
        width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
        backgroundColor: focused ? brand.primarySoft : 'transparent',
      }}>
        <MaterialCommunityIcons name={(focused ? active : name) as any} color={color} size={22} />
      </View>
    );
    return TabIcon;
  };
  return (
    <Tabs
      screenListeners={{ tabPress: () => haptic.tap() }}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: brand.bg },
        tabBarStyle: {
          backgroundColor: '#fff', borderTopWidth: 0, height: 66 + insets.bottom, paddingBottom: 8 + insets.bottom, paddingTop: 8,
          shadowColor: '#14211D', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 12,
        },
        tabBarActiveTintColor: brand.primary,
        tabBarInactiveTintColor: brand.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 2 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tab.home'), tabBarIcon: icon('home-variant-outline', 'home-variant') }} />
      <Tabs.Screen name="customers" options={{ title: currentLang() === 'hi' ? 'ग्राहक' : plural(customerWord), tabBarIcon: icon('account-group-outline', 'account-group') }} />
      <Tabs.Screen name="bills" options={{ title: t('tab.bills'), tabBarIcon: icon('file-document-outline', 'file-document') }} />
      <Tabs.Screen name="reports" options={{ title: t('tab.reports'), tabBarIcon: icon('chart-box-outline', 'chart-box') }} />
      <Tabs.Screen name="more" options={{ title: t('tab.more'), tabBarIcon: icon('dots-grid', 'dots-grid') }} />
    </Tabs>
  );
}
