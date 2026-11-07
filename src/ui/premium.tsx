import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { brand, radius, tabular, type } from './theme';
import { Tap } from './components';
import { haptic } from './haptics';

/**
 * Calm, professional building blocks: solid colours, hairline borders, grouped lists.
 * No gradients or glow — the numbers are the hero.
 */

/** Large page title with optional subtitle and a right-side action. */
export function ScreenHeader({ title, subtitle, action, onAction, actionIcon = 'plus' }: {
  title: string; subtitle?: string; action?: string; onAction?: () => void; actionIcon?: string;
}) {
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: brand.bg }}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[type.h1, { color: brand.ink }]} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={{ color: brand.muted, marginTop: 2 }} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {action && onAction ? (
          <Tap onPress={() => { haptic.tap(); onAction(); }} label={action}>
            <View style={styles.headerBtn}>
              <MaterialCommunityIcons name={actionIcon as any} size={18} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}>{action}</Text>
            </View>
          </Tap>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

/** Small uppercase label used above numbers. */
export function Label({ children, dark, style }: { children: React.ReactNode; dark?: boolean; style?: any }) {
  return <Text style={[type.label, { color: dark ? brand.onDarkMuted : brand.muted }, style]}>{children}</Text>;
}

/** Plan marker. Quiet by design: small, outlined, no crown. */
export function ProBadge({ plan = 'pro', small }: { plan?: 'pro' | 'business'; small?: boolean }) {
  return (
    <View style={{ borderRadius: radius.pill, paddingHorizontal: small ? 6 : 8, paddingVertical: small ? 1 : 3, backgroundColor: brand.goldSoft, borderWidth: 1, borderColor: '#EBCB8B' }}>
      <Text style={{ fontSize: small ? 10 : 11, fontWeight: '800', color: '#8A5E0E', letterSpacing: 0.5 }}>
        {plan === 'business' ? 'BUSINESS' : 'PRO'}
      </Text>
    </View>
  );
}

/** A solid brand card for the one summary that matters on a screen. */
export function SummaryCard({ children, style, onPress, tone = 'brand' }: {
  children: React.ReactNode; style?: ViewStyle | ViewStyle[]; onPress?: () => void; tone?: 'brand' | 'running';
}) {
  const body = <View style={[styles.summary, tone === 'running' ? { backgroundColor: brand.primaryDeep } : null, style as any]}>{children}</View>;
  return onPress ? <Tap onPress={onPress}>{body}</Tap> : body;
}
/** Kept for screens written earlier; now a solid card. */
export const GradientCard = ({ children, style, onPress }: { children: React.ReactNode; colors?: unknown; style?: ViewStyle | ViewStyle[]; onPress?: () => void }) => (
  <SummaryCard style={style} onPress={onPress} tone="running">{children}</SummaryCard>
);

/** A number with a caption, on light or dark backgrounds. */
export function StatTile({ label, value, node, icon, dark, accent, style, onPress }: {
  label: string; value?: string; node?: React.ReactNode; icon?: string; dark?: boolean; accent?: string;
  style?: ViewStyle; onPress?: () => void;
}) {
  const body = (
    <View style={[dark ? styles.tileDark : styles.tile, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        {icon ? <MaterialCommunityIcons name={icon as any} size={15} color={dark ? brand.onDarkMuted : accent ?? brand.muted} /> : null}
        <Text numberOfLines={1} style={{ fontSize: 12, color: dark ? brand.onDarkMuted : brand.muted, marginLeft: icon ? 6 : 0, flex: 1 }}>{label}</Text>
      </View>
      {node ?? <Text numberOfLines={1} adjustsFontSizeToFit style={[tabular, { fontSize: 20, fontWeight: '800', color: dark ? '#fff' : brand.ink }]}>{value}</Text>}
    </View>
  );
  return onPress ? <Tap onPress={onPress} style={{ flex: 1 }}>{body}</Tap> : <View style={{ flex: 1 }}>{body}</View>;
}

/** Smooth line of recent values (e.g. earnings per day). */
export function Sparkline({ data, width = 120, height = 36, color = '#fff' }: {
  data: number[]; width?: number; height?: number; color?: string; fill?: string;
}) {
  if (data.length < 2) return <View style={{ width, height }} />;
  const max = Math.max(...data, 1);
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => [i * step, height - 3 - (v / max) * (height - 6)] as const);
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
  }
  const last = pts[pts.length - 1];
  return (
    <Svg width={width} height={height}>
      <Path d={d} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" />
      <Circle cx={last[0]} cy={last[1]} r={3} fill={color} />
    </Svg>
  );
}

/** Vertical bars drawn with plain Views (reliable on every phone). The highlighted bar is "now". */
export function BarChart({ data, height = 140, highlight, formatValue }: {
  data: { label: string; value: number }[]; height?: number; highlight?: number; formatValue?: (v: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const peak = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  const empty = data.every((d) => d.value === 0);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 8 }}>
        {data.map((d, i) => {
          const h = d.value > 0 ? Math.max(6, (d.value / max) * (height - 20)) : 4;
          const on = i === highlight;
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height }}>
              {!empty && i === peak && d.value > 0 && formatValue ? (
                <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 10, color: brand.muted, marginBottom: 4 }}>{formatValue(d.value)}</Text>
              ) : null}
              <View style={{ width: '100%', maxWidth: 34, height: h, borderRadius: 6, backgroundColor: d.value > 0 ? (on ? brand.primary : '#9FCDBE') : brand.line }} />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        {data.map((d, i) => (
          <Text key={i} numberOfLines={1} adjustsFontSizeToFit style={{ flex: 1, textAlign: 'center', fontSize: 11, color: i === highlight ? brand.ink : brand.muted, fontWeight: i === highlight ? '800' : '500' }}>
            {d.label}
          </Text>
        ))}
      </View>
      {empty ? <Text style={{ color: brand.muted, textAlign: 'center', marginTop: 8 }}>No earnings in this period yet.</Text> : null}
    </View>
  );
}

/** Horizontal share bar for "top customers". */
export function ShareBar({ fraction, color = brand.primary }: { fraction: number; color?: string }) {
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: brand.tint, overflow: 'hidden', marginTop: 6 }}>
      <View style={{ width: `${Math.max(2, Math.min(100, fraction * 100))}%`, height: 6, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

/** Circular progress (goal). */
export function ProgressRing({ progress, size = 76, stroke = 7, color = '#fff', track = 'rgba(255,255,255,0.2)', children }: {
  progress: number; size?: number; stroke?: number; color?: string; track?: string; children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - p)} strokeLinecap="round" />
      </Svg>
      {children}
    </View>
  );
}

/** The Start button: a solid disc, 72dp+ as the PRD asks, with a firm haptic. */
export function StartButton({ onPress, disabled, label, size = 132 }: { onPress: () => void; disabled?: boolean; label: string; size?: number }) {
  return (
    <Tap onPress={() => { haptic.heavy(); onPress(); }} disabled={disabled} label={label}>
      <View style={{ width: size + 20, height: size + 20, borderRadius: (size + 20) / 2, backgroundColor: disabled ? brand.tint : brand.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: disabled ? '#C9C4B7' : brand.primary, alignItems: 'center', justifyContent: 'center' }}>
          <MaterialCommunityIcons name="play" size={size * 0.4} color="#fff" style={{ marginLeft: size * 0.04 }} />
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 1, marginTop: -2 }}>START</Text>
        </View>
      </View>
    </Tap>
  );
}

/** A soft blinking dot, for "live" states. */
export function LiveDot({ color = '#6EE7B7' }: { color?: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 800, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] }) }} />;
}

/** A tappable notice with an icon, a factual message and one action. */
export function InsightCard({ icon, tone = 'brand', title, body, action, onPress }: {
  icon: string; tone?: 'brand' | 'money' | 'pending' | 'danger' | 'gold'; title: string; body?: string; action?: string; onPress?: () => void;
}) {
  const map = {
    brand: [brand.primary, brand.primarySoft], money: [brand.money, brand.moneySoft], pending: [brand.pending, brand.pendingSoft],
    danger: [brand.danger, brand.dangerSoft], gold: ['#8A5E0E', brand.goldSoft],
  } as const;
  const [fg, bg] = map[tone];
  return (
    <Tap onPress={onPress ? () => { haptic.tap(); onPress(); } : undefined} label={title}>
      <View style={styles.insight}>
        <View style={[styles.insightIcon, { backgroundColor: bg }]}>
          <MaterialCommunityIcons name={icon as any} size={20} color={fg} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: brand.ink }} numberOfLines={2}>{title}</Text>
          {body ? <Text style={{ fontSize: 13, color: brand.muted, marginTop: 2 }} numberOfLines={2}>{body}</Text> : null}
        </View>
        {action ? <Text style={{ color: fg, fontWeight: '800', fontSize: 14 }}>{action}</Text> : null}
        {action ? <MaterialCommunityIcons name="chevron-right" size={18} color={fg} style={{ marginLeft: -6 }} /> : null}
      </View>
    </Tap>
  );
}

/** Grey sample shapes that show the *kind* of content, never the user's real numbers. */
function LockPreview({ kind }: { kind: 'chart' | 'tiles' | 'list' }) {
  const g = '#E4E0D6';
  if (kind === 'chart') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 64, gap: 8 }}>
        {[0.35, 0.6, 0.45, 0.85, 0.55, 0.7, 0.4].map((h, i) => (
          <View key={i} style={{ flex: 1, height: 64 * h, borderRadius: 5, backgroundColor: i === 3 ? '#B9D9CD' : g }} />
        ))}
      </View>
    );
  }
  if (kind === 'tiles') {
    return (
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[0, 1].map((i) => (
          <View key={i} style={{ flex: 1, borderRadius: 10, backgroundColor: brand.bg, padding: 10, gap: 6 }}>
            <View style={{ width: '60%', height: 8, borderRadius: 4, backgroundColor: g }} />
            <View style={{ width: '40%', height: 14, borderRadius: 4, backgroundColor: g }} />
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={{ gap: 10 }}>
      {[0.9, 0.65, 0.4].map((w, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: g }} />
          <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: brand.bg }}>
            <View style={{ width: `${w * 100}%`, height: 8, borderRadius: 4, backgroundColor: i === 0 ? '#B9D9CD' : g }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * A paid section. When locked it shows a separate card with a sample preview (no real data),
 * what the section does, and a button to the plans. The real content is not rendered at all.
 */
export function ProLock({ children, locked, title, body, onUnlock, plan = 'pro', preview = 'chart' }: {
  children: React.ReactNode; locked: boolean; title: string; body: string; onUnlock: () => void;
  plan?: 'pro' | 'business'; preview?: 'chart' | 'tiles' | 'list';
}) {
  if (!locked) return <>{children}</>;
  return (
    <View style={styles.lock}>
      <LockPreview kind={preview} />
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
        <MaterialCommunityIcons name="lock-outline" size={16} color={brand.muted} />
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: brand.ink, marginLeft: 6 }}>{title}</Text>
        <ProBadge plan={plan} small />
      </View>
      <Text style={{ fontSize: 14, color: brand.muted, marginTop: 4 }}>{body}</Text>
      <Tap onPress={() => { haptic.tap(); onUnlock(); }} label={`See ${plan} plan`} style={{ marginTop: 12, alignSelf: 'flex-start' }}>
        <View style={{ borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: brand.primary }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>See {plan === 'business' ? 'Business' : 'Pro'} plan</Text>
        </View>
      </Tap>
    </View>
  );
}

/** Rounded segmented selector (used for periods and filters). */
export function Segmented<T extends string>({ value, options, onChange, dark }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; dark?: boolean;
}) {
  return (
    <View style={[styles.seg, dark ? { backgroundColor: brand.glass, borderColor: brand.glassLine } : null]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Tap key={o.value} onPress={() => { haptic.tap(); onChange(o.value); }} label={o.label} style={{ flex: 1 }}>
            <View style={[styles.segItem, on ? (dark ? { backgroundColor: '#fff' } : { backgroundColor: brand.ink }) : null]}>
              <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontWeight: '700', fontSize: 13, color: on ? (dark ? brand.primaryDeep : '#fff') : (dark ? brand.onDarkMuted : brand.muted) }}>{o.label}</Text>
            </View>
          </Tap>
        );
      })}
    </View>
  );
}

/** Coloured circle with initials, for people. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('') || '?';
  const palette = ['#DCEFE8', '#E5E7F6', '#FBF0DC', '#F6E3EC', '#E3F0F8', '#ECEAE3'];
  const ink = ['#0F5C4D', '#3D47A1', '#8A5E0E', '#9C3D67', '#20607F', '#4F5A55'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const k = h % palette.length;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: palette[k], alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: ink[k], fontWeight: '800', fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}

/** A white group of rows with hairline dividers, like a native settings list. */
export function ListGroup({ children, title, style }: { children: React.ReactNode; title?: string; style?: ViewStyle }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={style}>
      {title ? <Text style={[type.label, { color: brand.muted, marginBottom: 8, marginLeft: 4 }]}>{title}</Text> : null}
      <View style={styles.group}>
        {items.map((c, i) => (
          <View key={i}>
            {c}
            {i < items.length - 1 ? <View style={styles.divider} /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

/** One row inside a ListGroup. */
export function ListItem({ title, subtitle, left, right, icon, iconColor, onPress, danger }: {
  title: string; subtitle?: string; left?: React.ReactNode; right?: React.ReactNode; icon?: string; iconColor?: string;
  onPress?: () => void; danger?: boolean;
}) {
  const inner = (
    <View style={styles.item}>
      {left ?? (icon ? (
        <View style={[styles.itemIcon, { backgroundColor: danger ? brand.dangerSoft : brand.tint }]}>
          <MaterialCommunityIcons name={icon as any} size={19} color={danger ? brand.danger : iconColor ?? brand.primary} />
        </View>
      ) : null)}
      <View style={{ flex: 1, marginLeft: left || icon ? 12 : 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '600', color: danger ? brand.danger : brand.ink }}>{title}</Text>
        {subtitle ? <Text numberOfLines={2} style={{ fontSize: 13, color: brand.muted, marginTop: 1 }}>{subtitle}</Text> : null}
      </View>
      {right}
      {onPress && !right ? <MaterialCommunityIcons name="chevron-right" size={20} color="#B5B0A4" /> : null}
    </View>
  );
  return onPress ? <Tap onPress={() => { haptic.tap(); onPress(); }} label={title}>{inner}</Tap> : inner;
}

/** Small rounded filter chips in a row. */
export function FilterChips<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string; count?: number }[]; onChange: (v: T) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Tap key={o.value} onPress={() => { haptic.tap(); onChange(o.value); }} label={o.label}>
            <View style={[styles.chip, on ? { backgroundColor: brand.ink, borderColor: brand.ink } : null]}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: on ? '#fff' : brand.ink }}>{o.label}</Text>
              {o.count !== undefined ? (
                <Text style={{ fontSize: 12, fontWeight: '700', color: on ? 'rgba(255,255,255,0.7)' : brand.muted, marginLeft: 6 }}>{o.count}</Text>
              ) : null}
            </View>
          </Tap>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12 },
  headerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: brand.primary, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
  summary: { backgroundColor: brand.primary, borderRadius: radius.lg, padding: 20 },
  tile: { backgroundColor: brand.surface, borderRadius: radius.md, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: brand.line },
  tileDark: { backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: radius.md, padding: 12 },
  insight: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: brand.surface, borderRadius: radius.md, padding: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: brand.line,
  },
  insightIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  lock: { backgroundColor: brand.surface, borderRadius: radius.md, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: brand.line },
  seg: { flexDirection: 'row', backgroundColor: brand.tint, borderRadius: radius.pill, padding: 4 },
  segItem: { borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 4, alignItems: 'center' },
  group: { backgroundColor: brand.surface, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: brand.line, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: brand.line, marginLeft: 64 },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, minHeight: 60 },
  itemIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: brand.line, backgroundColor: brand.surface },
});
