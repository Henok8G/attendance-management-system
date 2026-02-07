-- Drop existing SELECT policy and recreate with TO authenticated
DROP POLICY IF EXISTS "Allow reading permission requests" ON public.permission_requests;
CREATE POLICY "Authenticated users can read permission requests"
ON public.permission_requests FOR SELECT TO authenticated USING (true);