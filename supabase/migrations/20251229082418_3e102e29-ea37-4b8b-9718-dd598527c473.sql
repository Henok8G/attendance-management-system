-- Fix 1: Make worker-photos bucket private
UPDATE storage.buckets SET public = false WHERE id = 'worker-photos';

-- Fix 2: Drop existing overly permissive storage policies
DROP POLICY IF EXISTS "Allow public read access" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated read access" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects;

-- Fix 3: Create strict owner-only storage policies
-- Owner can view photos of their workers
CREATE POLICY "Owner can view worker photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'worker-photos'
  AND auth.uid() IS NOT NULL
  AND (
    -- Check if the file belongs to a worker owned by this user
    EXISTS (
      SELECT 1 FROM public.workers w
      WHERE w.owner_id = auth.uid()
      AND storage.objects.name LIKE w.id::text || '%'
    )
    -- Or if it's the owner's own profile photo
    OR storage.objects.name LIKE auth.uid()::text || '%'
  )
);

-- Owner can upload photos for their workers
CREATE POLICY "Owner can upload worker photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'worker-photos'
  AND auth.uid() IS NOT NULL
  AND (
    -- Check if uploading for a worker they own
    EXISTS (
      SELECT 1 FROM public.workers w
      WHERE w.owner_id = auth.uid()
      AND storage.objects.name LIKE w.id::text || '%'
    )
    -- Or uploading their own profile photo
    OR storage.objects.name LIKE auth.uid()::text || '%'
  )
);

-- Owner can update photos for their workers
CREATE POLICY "Owner can update worker photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'worker-photos'
  AND auth.uid() IS NOT NULL
  AND (
    EXISTS (
      SELECT 1 FROM public.workers w
      WHERE w.owner_id = auth.uid()
      AND storage.objects.name LIKE w.id::text || '%'
    )
    OR storage.objects.name LIKE auth.uid()::text || '%'
  )
);

-- Owner can delete photos for their workers
CREATE POLICY "Owner can delete worker photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'worker-photos'
  AND auth.uid() IS NOT NULL
  AND (
    EXISTS (
      SELECT 1 FROM public.workers w
      WHERE w.owner_id = auth.uid()
      AND storage.objects.name LIKE w.id::text || '%'
    )
    OR storage.objects.name LIKE auth.uid()::text || '%'
  )
);

-- Fix 4: Improve is_worker_owner function with explicit NULL check
CREATE OR REPLACE FUNCTION public.is_worker_owner(_worker_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE 
    WHEN auth.uid() IS NULL THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.workers
      WHERE id = _worker_id
      AND owner_id = auth.uid()
    )
  END
$$;