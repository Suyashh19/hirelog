import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';
import { sqlite } from '../db/client';
import { all, bump, uuid, now } from '../db/repo';

/**
 * Photos on a job (machine hours counter, site, before/after, receipts).
 * Kept on this phone in the app's own folder, resized to ~1280 px so a photo is ~150–300 KB.
 */
export interface EntryPhoto { id: string; entryId: string; uri: string; takenAt: number; label: string | null }

const dir = () => {
  const d = new Directory(Paths.document, 'photos');
  if (!d.exists) d.create({ intermediates: true });
  return d;
};

export const listPhotos = (entryId: string) =>
  all<EntryPhoto>('SELECT * FROM entry_photos WHERE entry_id=? ORDER BY taken_at', [entryId]);

export async function addPhoto(entryId: string, from: 'camera' | 'library', label?: string): Promise<{ ok: boolean; message?: string }> {
  try {
    if (from === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return { ok: false, message: 'Camera permission was not given.' };
    }
    const res = from === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled || !res.assets?.[0]) return { ok: false };
    const small = await ImageManipulator.manipulate(res.assets[0].uri).resize({ width: 1280 }).renderAsync();
    const out = await small.saveAsync({ format: SaveFormat.JPEG, compress: 0.6 });
    const id = uuid();
    const dest = new File(dir(), `${id}.jpg`);
    new File(out.uri).copySync(dest, { overwrite: true });
    sqlite.runSync('INSERT INTO entry_photos (id,entry_id,uri,taken_at,label) VALUES (?,?,?,?,?)', [id, entryId, dest.uri, now(), label ?? null]);
    bump();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: String(e?.message ?? e).slice(0, 160) };
  }
}

export function deletePhoto(id: string) {
  const p = all<EntryPhoto>('SELECT * FROM entry_photos WHERE id=?', [id])[0];
  if (p) {
    try { const f = new File(p.uri); if (f.exists) f.delete(); } catch { /* already gone */ }
  }
  sqlite.runSync('DELETE FROM entry_photos WHERE id=?', [id]);
  bump();
}

/** Small base64 images for the PDF/preview (max 6 per bill, ~400 px wide). */
export async function photosForBill(entryIds: string[], max = 6): Promise<{ src: string; caption: string }[]> {
  if (!entryIds.length) return [];
  const rows = all<EntryPhoto>(
    `SELECT * FROM entry_photos WHERE entry_id IN (${entryIds.map(() => '?').join(',')}) ORDER BY taken_at LIMIT ${max}`, entryIds);
  const out: { src: string; caption: string }[] = [];
  for (const p of rows) {
    try {
      const thumb = await ImageManipulator.manipulate(p.uri).resize({ width: 400 }).renderAsync();
      const s = await thumb.saveAsync({ format: SaveFormat.JPEG, compress: 0.5, base64: true });
      if (s.base64) out.push({ src: `data:image/jpeg;base64,${s.base64}`, caption: `${p.label ? p.label + ' · ' : ''}${new Date(p.takenAt).toLocaleString()}` });
    } catch {
      // a missing photo never blocks the bill
    }
  }
  return out;
}
