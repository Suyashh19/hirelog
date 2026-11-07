import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Text, Button, Snackbar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { formatINR } from '../../core/money';
import { amountsHidden } from '../../data/membership';
import { brand, radius, softShadow, tabular } from '../theme';

/** Gentle fade + rise on mount. */
export function FadeIn({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: ViewStyle }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 380, delay, useNativeDriver: true }).start();
  }, [v, delay]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Pressable with a soft press animation. */
export function Tap({ onPress, children, style, disabled, label }: {
  onPress?: () => void; children: React.ReactNode; style?: ViewStyle | ViewStyle[]; disabled?: boolean; label?: string;
}) {
  return (
    <Pressable
      onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [style as any, pressed && { opacity: 0.88, transform: [{ scale: 0.985 }] }]}
    >
      {children}
    </Pressable>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[]; onPress?: () => void }) {
  const body = <View style={[styles.card, style as any]}>{children}</View>;
  return onPress ? <Tap onPress={onPress}>{body}</Tap> : body;
}

export function SectionTitle({ children, action, onAction }: { children: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionRow}>
      <Text variant="titleMedium" style={{ fontWeight: '700', color: brand.ink }}>{children}</Text>
      {action ? <Text onPress={onAction} style={{ color: brand.primary, fontWeight: '600' }}>{action}</Text> : null}
    </View>
  );
}

export function IconBubble({ icon, size = 44, color = brand.primary, bg = brand.primarySoft }: { icon: string; size?: number; color?: string; bg?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <MaterialCommunityIcons name={icon as any} size={size * 0.52} color={color} />
    </View>
  );
}

export function AmountText({ paise, tone, style }: { paise: number; tone?: 'received' | 'pending' | 'danger' | 'plain'; style?: any }) {
  const color = tone === 'received' ? brand.money : tone === 'pending' ? brand.pending : tone === 'danger' ? brand.danger : brand.ink;
  // team members without permission to see money get dots instead of amounts
  return <Text numberOfLines={1} adjustsFontSizeToFit style={[tabular, { fontWeight: '700', color }, style]}>{amountsHidden() ? '•••' : formatINR(paise)}</Text>;
}

export function EmptyState({ text, action, onAction, icon = 'sprout-outline' }: { text: string; action?: string; onAction?: () => void; icon?: string }) {
  return (
    <FadeIn style={styles.empty}>
      <IconBubble icon={icon} size={64} />
      <Text variant="bodyLarge" style={{ textAlign: 'center', marginVertical: 14, color: brand.muted }}>{text}</Text>
      {action && onAction ? <Button mode="contained" onPress={onAction} contentStyle={{ minHeight: 48, paddingHorizontal: 12 }}>{action}</Button> : null}
    </FadeIn>
  );
}

export function Chip({ icon, label, onPress }: { icon: string; label: string; onPress?: () => void }) {
  return (
    <Tap onPress={onPress} label={label} style={styles.chip}>
      <MaterialCommunityIcons name={icon as any} size={18} color={brand.primary} />
      <Text numberOfLines={1} style={{ marginLeft: 6, maxWidth: 150, color: brand.ink }}>{label}</Text>
      <MaterialCommunityIcons name="chevron-down" size={18} color={brand.muted} />
    </Tap>
  );
}

/** List row shown as a soft card. Pass `flush` when the parent already has horizontal padding. */
export function Row({ title, subtitle, right, icon, onPress, flush }: {
  title: string; subtitle?: string; right?: React.ReactNode; icon?: string; onPress?: () => void; flush?: boolean;
}) {
  const inner = (
    <View style={[styles.row, flush ? null : { marginHorizontal: 16 }]}>
      {icon ? <View style={{ marginRight: 12 }}><IconBubble icon={icon} size={40} /></View> : null}
      <View style={{ flex: 1 }}>
        <Text variant="titleMedium" numberOfLines={1} style={{ color: brand.ink, fontWeight: '600' }}>{title}</Text>
        {subtitle ? <Text variant="bodyMedium" style={{ color: brand.muted }} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {right}
      {onPress && !right ? <MaterialCommunityIcons name="chevron-right" size={22} color={brand.muted} /> : null}
    </View>
  );
  return onPress ? <Tap onPress={onPress}>{inner}</Tap> : inner;
}

/** Status is never shown by colour alone: icon + text. */
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: string; label: string; color: string; bg: string }> = {
    draft: { icon: 'file-edit-outline', label: 'Draft', color: '#5E6A66', bg: '#ECEAE3' },
    sent: { icon: 'send-check', label: 'Sent', color: brand.pending, bg: '#FBF1DC' },
    partly_paid: { icon: 'progress-check', label: 'Partly paid', color: brand.pending, bg: '#FBF1DC' },
    paid: { icon: 'check-circle', label: 'Paid', color: brand.money, bg: '#DFF3E8' },
  };
  const m = map[status] ?? map.draft;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: m.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, marginTop: 4 }}>
      <MaterialCommunityIcons name={m.icon as any} size={14} color={m.color} />
      <Text variant="labelMedium" style={{ marginLeft: 4, color: m.color }}>{m.label}</Text>
    </View>
  );
}

export function SourceBadge({ source, tamper, light }: { source: string; tamper?: boolean; light?: boolean }) {
  const label = source === 'live' ? 'Live timer' : source === 'manual' ? 'Added manually' : source === 'adjusted' ? 'Adjusted' : 'Edited';
  const icon = source === 'live' ? 'timer-outline' : source === 'manual' ? 'pencil-outline' : 'tune-variant';
  const c = light ? 'rgba(255,255,255,0.8)' : brand.muted;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <MaterialCommunityIcons name={icon as any} size={14} color={c} />
      <Text variant="bodySmall" style={{ marginLeft: 3, color: c }}>{label}</Text>
      {tamper ? (
        <>
          <MaterialCommunityIcons name="alert" size={14} color={brand.danger} style={{ marginLeft: 8 }} />
          <Text variant="bodySmall" style={{ marginLeft: 3, color: brand.danger }}>Clock changed</Text>
        </>
      ) : null}
    </View>
  );
}

/** UX rule 9: undo instead of "Are you sure?" */
export function UndoSnackbar({ visible, message, onUndo, onDismiss }: { visible: boolean; message: string; onUndo: () => void; onDismiss: () => void }) {
  return (
    <Snackbar visible={visible} onDismiss={onDismiss} duration={5000} action={{ label: 'Undo', onPress: onUndo }}>
      {message}
    </Snackbar>
  );
}

export function Picker<T extends { id: string }>({ items, selected, onSelect, label }: {
  items: T[]; selected: string | null; onSelect: (id: string) => void; label: (i: T) => string;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((i) => {
        const on = i.id === selected;
        return (
          <Tap key={i.id} onPress={() => onSelect(i.id)} label={label(i)}
            style={[styles.pick, on ? { borderColor: brand.primary, backgroundColor: brand.primarySoft } : null] as any}>
            {on ? <MaterialCommunityIcons name="check" size={16} color={brand.primary} style={{ marginRight: 4 }} /> : null}
            <Text style={{ color: on ? brand.primary : brand.ink, fontWeight: on ? '600' : '400' }}>{label(i)}</Text>
          </Tap>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: brand.surface, borderRadius: radius.md, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: brand.line, ...softShadow },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  empty: { padding: 32, alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 14, minHeight: 48, borderColor: brand.line, backgroundColor: brand.surface },
  row: {
    flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 8,
    backgroundColor: brand.surface, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: brand.line,
  },
  pick: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 16, minHeight: 48, borderColor: brand.line, backgroundColor: brand.surface },
});
