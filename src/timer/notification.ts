import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import * as Device from 'expo-device';

const CHANNEL = 'timer';
const STICKY_ID = 'timer-sticky';
const STILL_ID = 'timer-still-working';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export async function setupNotifications() {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Running timer', importance: Notifications.AndroidImportance.LOW,
      });
    }
    await Notifications.setNotificationCategoryAsync('timer', [
      { identifier: 'stop', buttonTitle: 'Stop', options: { opensAppToForeground: true } },
    ]);
    const p = await Notifications.getPermissionsAsync();
    if (!p.granted) await Notifications.requestPermissionsAsync();
  } catch {}
}

/** TM-4: sticky notification. Shows start time (the OS cannot tick it live without a foreground service). */
export async function showTimerNotification(label: string, startedAt: number) {
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: STICKY_ID,
      content: {
        title: 'Timer running',
        body: `${label} · started ${new Date(startedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`,
        sticky: true, autoDismiss: false, categoryIdentifier: 'timer', data: { type: 'timer' },
      },
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL } as any : null,
    });
  } catch {}
}

/** TM-7: "Still working?" after N hours. */
export async function scheduleStillWorking(hours: number) {
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: STILL_ID,
      content: { title: 'Still working?', body: `Your timer has been running for ${hours} hours. Tap to check.`, data: { type: 'timer' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: hours * 3600 } as any,
    });
  } catch {}
}

export async function clearTimerNotifications() {
  try {
    await Notifications.dismissNotificationAsync(STICKY_ID);
    await Notifications.cancelScheduledNotificationAsync(STICKY_ID);
    await Notifications.cancelScheduledNotificationAsync(STILL_ID);
  } catch {}
}

/** Device uptime in ms; null when unavailable. Used for tamper stamps (TP-2). */
export async function uptimeMs(): Promise<number | null> {
  try {
    return await Device.getUptimeAsync();
  } catch {
    return null;
  }
}
