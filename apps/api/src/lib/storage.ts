import type { Supabase } from '../plugins/supabase.js';

/** Private bucket, signed URLs only (spec 11). The service role stays on the server. */
export function createStorage(supabase: Supabase, bucket: string) {
  const files = () => supabase.admin.storage.from(bucket);
  return {
    async signedUpload(path: string): Promise<string> {
      const { data, error } = await files().createSignedUploadUrl(path, { upsert: true });
      if (error) throw error;
      return data.signedUrl;
    },
    async signedRead(path: string, seconds = 600): Promise<string> {
      const { data, error } = await files().createSignedUrl(path, seconds);
      if (error) throw error;
      return data.signedUrl;
    },
    async exists(path: string): Promise<boolean> {
      try {
        const { data, error } = await files().exists(path);
        if (error) throw error;
        return data;
      } catch (err) {
        // storage-js rejects with a 404 instead of answering `false`.
        if ((err as { statusCode?: string }).statusCode === '404') return false;
        throw err;
      }
    },
    async download(path: string): Promise<Buffer> {
      const { data, error } = await files().download(path);
      if (error) throw error;
      return Buffer.from(await data.arrayBuffer());
    },
    async upload(path: string, body: Buffer, contentType: string): Promise<void> {
      const { error } = await files().upload(path, body, { contentType, upsert: true });
      if (error) throw error;
    },
    async remove(paths: string[]): Promise<void> {
      if (!paths.length) return;
      const { error } = await files().remove(paths);
      if (error) throw error;
    },
  };
}
export type Storage = ReturnType<typeof createStorage>;

export const photoKeys = (orgId: string, taskId: string, photoId: string) => {
  const base = `org/${orgId}/tasks/${taskId}/photos/${photoId}`;
  return { original: `${base}/original.jpg`, thumb: `${base}/thumb.jpg`, pdf: `${base}/pdf.jpg` };
};
