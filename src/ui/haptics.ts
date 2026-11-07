import * as Haptics from 'expo-haptics';

/** Small physical feedback on the actions that matter. Never throws (some phones have no vibrator). */
export const haptic = {
  tap: () => { Haptics.selectionAsync().catch(() => {}); },
  press: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); },
  heavy: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}); },
  success: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); },
  warn: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}); },
};
