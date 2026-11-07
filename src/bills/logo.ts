import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { bump, kvGet, kvSet } from '../db/repo';

/** BL-4: business logo for Pro bills. Stored on the phone as a small PNG data URI (about 10-30 KB). */
export const getLogo = (): string | null => kvGet('logo') || null;

export async function pickLogo(): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
    if (res.canceled || !res.assets?.[0]) return { ok: false };
    const small = await ImageManipulator.manipulate(res.assets[0].uri).resize({ width: 240 }).renderAsync();
    const out = await small.saveAsync({ base64: true, format: SaveFormat.PNG });
    if (!out.base64) return { ok: false, message: 'Could not read the image.' };
    kvSet('logo', `data:image/png;base64,${out.base64}`);
    bump();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: String(e?.message ?? e).slice(0, 160) };
  }
}

export function clearLogo() {
  kvSet('logo', '');
  bump();
}
