import { Alert } from 'react-native';
// SDK 58: the functions exported from "expo-contacts" itself throw; the working picker lives in "expo-contacts/legacy".
import * as Contacts from 'expo-contacts/legacy';

export interface PickedContact { name: string; phone: string }

/** Opens the system contact picker (no permission prompt needed). Returns null if cancelled or unavailable. */
export async function pickContact(): Promise<PickedContact | null> {
  try {
    const c = await Contacts.presentContactPickerAsync();
    if (!c) return null;
    return { name: c.name ?? '', phone: c.phoneNumbers?.[0]?.number ?? '' };
  } catch (e: any) {
    Alert.alert('Could not open contacts', 'Please type the name and phone number instead.\n\n' + String(e?.message ?? e).slice(0, 120));
    return null;
  }
}
