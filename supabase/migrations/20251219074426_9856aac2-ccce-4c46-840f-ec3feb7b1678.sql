-- Create storage bucket for worker photos
INSERT INTO storage.buckets (id, name, public) VALUES ('worker-photos', 'worker-photos', true);

-- Allow authenticated users to upload photos
CREATE POLICY "Authenticated users can upload worker photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'worker-photos');

-- Allow authenticated users to update photos
CREATE POLICY "Authenticated users can update worker photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'worker-photos');

-- Allow authenticated users to delete photos
CREATE POLICY "Authenticated users can delete worker photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'worker-photos');

-- Allow public read access to worker photos
CREATE POLICY "Public read access for worker photos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'worker-photos');