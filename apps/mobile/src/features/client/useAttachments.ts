import { MAX_OBJECTION_ATTACHMENTS, MAX_PHOTO_BYTES } from '@provecheck/shared';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { newId } from '../tasks/helpers';

export interface AttachmentItem {
  id: string;
  uri: string;
  status: 'working' | 'done' | 'error';
}

const SIZES = { original: 1600, thumb: 320 } as const;

/** Re-encoding drops EXIF and GPS metadata (RN-21). */
async function version(uri: string, w: number, h: number, longSide: number) {
  const scale = Math.min(1, longSide / Math.max(w, h));
  const out = await manipulateAsync(
    uri,
    scale < 1
      ? [{ resize: w >= h ? { width: Math.round(w * scale) } : { height: Math.round(h * scale) } }]
      : [],
    { compress: 0.7, format: SaveFormat.JPEG },
  );
  return { uri: out.uri, blob: await (await fetch(out.uri)).blob() };
}

const put = async (url: string, blob: Blob) => {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'image/jpeg' },
    body: blob,
  });
  if (!res.ok) throw new Error(`upload failed ${res.status}`);
};

/** F11: up to five images, uploaded before the objection is sent. They share one staging id. */
export function useAttachments(taskId: string, onError: (err: unknown) => void) {
  const stagingId = useMemo(() => newId(), []);
  const [items, setItems] = useState<AttachmentItem[]>([]);
  const count = useRef(0);
  const patch = (id: string, next: Partial<AttachmentItem>) =>
    setItems((all) => all.map((p) => (p.id === id ? { ...p, ...next } : p)));

  const process = useCallback(
    async (asset: ImagePicker.ImagePickerAsset, position: number) => {
      const id = newId();
      setItems((all) => [...all, { id, uri: asset.uri, status: 'working' }]);
      try {
        const w = asset.width || 1600;
        const h = asset.height || 1200;
        const [original, thumb] = await Promise.all([
          version(asset.uri, w, h, SIZES.original),
          version(asset.uri, w, h, SIZES.thumb),
        ]);
        patch(id, { uri: thumb.uri });
        if ([original, thumb].some((v) => v.blob.size > MAX_PHOTO_BYTES))
          throw new Error('image too large');
        const { uploads } = await api.myServices.presignAttachment(taskId, {
          attachmentId: id,
          stagingId,
          position,
          bytes: Math.max(original.blob.size, thumb.blob.size),
        });
        await Promise.all([put(uploads.original, original.blob), put(uploads.thumb, thumb.blob)]);
        await api.myServices.confirmAttachment(taskId, id);
        patch(id, { status: 'done' });
      } catch (err) {
        patch(id, { status: 'error' });
        onError(err);
      }
    },
    [taskId, stagingId, onError],
  );

  const add = useCallback(
    async (source: 'camera' | 'library') => {
      const room = MAX_OBJECTION_ATTACHMENTS - items.length;
      if (room <= 0) return;
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        quality: 1,
        exif: false,
        ...(source === 'library' ? { allowsMultipleSelection: true, selectionLimit: room } : {}),
      };
      if (source === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted)
        return;
      const res =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (res.canceled) return;
      for (const asset of res.assets.slice(0, room)) await process(asset, count.current++);
    },
    [items.length, process],
  );

  return {
    stagingId,
    items,
    add,
    remove: (id: string) => setItems((all) => all.filter((p) => p.id !== id)),
    busy: items.some((p) => p.status === 'working'),
    failed: items.some((p) => p.status === 'error'),
    doneIds: items.filter((p) => p.status === 'done').map((p) => p.id),
  };
}
