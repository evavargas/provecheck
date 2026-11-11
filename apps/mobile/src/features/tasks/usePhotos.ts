import { MAX_PHOTOS_PER_REPORT, MAX_PHOTO_BYTES } from '@provecheck/shared';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useRef, useState } from 'react';
import { api } from '../../api/client';
import { newId } from './helpers';

export interface PhotoItem {
  id: string;
  /** Local preview of the small version. */
  uri: string;
  status: 'working' | 'done' | 'error';
}

// Long side in pixels for each stored version (spec 10.3 and RN-16).
const SIZES = { original: 1600, thumb: 320, pdf: 1024 } as const;

/** Re-encoding through the manipulator also drops EXIF and GPS metadata (RN-12). */
async function version(uri: string, w: number, h: number, longSide: number) {
  const scale = Math.min(1, longSide / Math.max(w, h));
  const out = await manipulateAsync(
    uri,
    scale < 1
      ? [{ resize: w >= h ? { width: Math.round(w * scale) } : { height: Math.round(h * scale) } }]
      : [],
    { compress: 0.7, format: SaveFormat.JPEG },
  );
  const blob = await (await fetch(out.uri)).blob();
  return { uri: out.uri, blob };
}

const put = async (url: string, blob: Blob) => {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'image/jpeg' },
    body: blob,
  });
  if (!res.ok) throw new Error(`upload failed ${res.status}`);
};

/** F7.2: compress, upload and confirm each photo; the caller only needs the confirmed ids, in order. */
export function usePhotos(taskId: string, onError: (err: unknown) => void) {
  const [items, setItems] = useState<PhotoItem[]>([]);
  const count = useRef(0);

  const patch = (id: string, next: Partial<PhotoItem>) =>
    setItems((all) => all.map((p) => (p.id === id ? { ...p, ...next } : p)));

  const process = useCallback(
    async (asset: ImagePicker.ImagePickerAsset, position: number) => {
      const id = newId();
      setItems((all) => [...all, { id, uri: asset.uri, status: 'working' }]);
      try {
        const w = asset.width || 1600;
        const h = asset.height || 1200;
        const [original, thumb, pdf] = await Promise.all([
          version(asset.uri, w, h, SIZES.original),
          version(asset.uri, w, h, SIZES.thumb),
          version(asset.uri, w, h, SIZES.pdf),
        ]);
        patch(id, { uri: thumb.uri });
        if ([original, thumb, pdf].some((v) => v.blob.size > MAX_PHOTO_BYTES))
          throw new Error('photo too large');
        const { uploads } = await api.myTasks.presignPhoto(taskId, {
          photoId: id,
          position,
          bytes: Math.max(original.blob.size, thumb.blob.size, pdf.blob.size),
        });
        await Promise.all([
          put(uploads.original, original.blob),
          put(uploads.thumb, thumb.blob),
          put(uploads.pdf, pdf.blob),
        ]);
        await api.myTasks.confirmPhoto(taskId, id);
        patch(id, { status: 'done' });
      } catch (err) {
        patch(id, { status: 'error' });
        onError(err);
      }
    },
    [taskId, onError],
  );

  const add = useCallback(
    async (source: 'camera' | 'library') => {
      const room = MAX_PHOTOS_PER_REPORT - items.length;
      if (room <= 0) return;
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        quality: 1,
        exif: false,
        ...(source === 'library' ? { allowsMultipleSelection: true, selectionLimit: room } : {}),
      };
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return;
      }
      const res =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (res.canceled) return;
      for (const asset of res.assets.slice(0, room)) await process(asset, count.current++);
    },
    [items.length, process],
  );

  const remove = (id: string) => setItems((all) => all.filter((p) => p.id !== id));
  return {
    items,
    add,
    remove,
    busy: items.some((p) => p.status === 'working'),
    failed: items.some((p) => p.status === 'error'),
    doneIds: items.filter((p) => p.status === 'done').map((p) => p.id),
  };
}
