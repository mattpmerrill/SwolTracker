-- Migration: Add avatar storage support for profile pictures
-- This migration adds avatar_url column and sets up Supabase storage for avatar uploads

-- 1. Add avatar_url column to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT NULL;

-- 2. Create storage bucket for avatars (run in Supabase dashboard or via CLI)
-- Note: The bucket creation needs to be done via Supabase dashboard or CLI:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

-- 3. Storage RLS Policies
-- These policies allow:
-- - Users can upload to their own folder
-- - Users can update/delete their own files
-- - Anyone can view avatars (public bucket)

-- Policy: Users can upload their own avatar
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can update their own avatar
CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can delete their own avatar
CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Avatars are publicly viewable
CREATE POLICY "Avatars are publicly viewable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Note: After running this migration, you need to manually create the storage bucket:
-- 1. Go to Supabase Dashboard > Storage
-- 2. Click "New bucket"
-- 3. Name: "avatars"
-- 4. Check "Public bucket"
-- 5. Click "Create bucket"
