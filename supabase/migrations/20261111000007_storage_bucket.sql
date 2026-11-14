-- Private bucket for photos, objection images, PDFs and logos. Locally `supabase start` creates it from config.toml;
-- this migration makes `supabase db push` create it in a hosted project too. Access is only through signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('provecheck', 'provecheck', false, 5242880, ARRAY['image/jpeg', 'image/png', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
