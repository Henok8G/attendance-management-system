-- =====================================================
-- STEP 1: Add owner_id columns to tables that need them
-- =====================================================

-- Add owner_id to workers table
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);

-- Add owner_id to scanners table  
ALTER TABLE public.scanners ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);

-- =====================================================
-- STEP 2: Create helper function for ownership checks
-- =====================================================

-- Security definer function to check worker ownership (avoids recursion)
CREATE OR REPLACE FUNCTION public.is_worker_owner(_worker_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workers
    WHERE id = _worker_id
    AND owner_id = auth.uid()
  )
$$;

-- =====================================================
-- STEP 3: Drop ALL existing permissive policies
-- =====================================================

-- Workers policies
DROP POLICY IF EXISTS "Authenticated users can view workers" ON public.workers;
DROP POLICY IF EXISTS "Authenticated users can insert workers" ON public.workers;
DROP POLICY IF EXISTS "Authenticated users can update workers" ON public.workers;
DROP POLICY IF EXISTS "Authenticated users can delete workers" ON public.workers;

-- Attendance policies
DROP POLICY IF EXISTS "Authenticated users can view attendance" ON public.attendance;
DROP POLICY IF EXISTS "Authenticated users can insert attendance" ON public.attendance;
DROP POLICY IF EXISTS "Authenticated users can update attendance" ON public.attendance;

-- Incidents policies
DROP POLICY IF EXISTS "Authenticated users can view incidents" ON public.incidents;
DROP POLICY IF EXISTS "Authenticated users can manage incidents" ON public.incidents;

-- Worker notes policies
DROP POLICY IF EXISTS "Authenticated users can view worker notes" ON public.worker_notes;
DROP POLICY IF EXISTS "Authenticated users can insert worker notes" ON public.worker_notes;
DROP POLICY IF EXISTS "Authenticated users can update worker notes" ON public.worker_notes;
DROP POLICY IF EXISTS "Authenticated users can delete worker notes" ON public.worker_notes;

-- Scanners policies
DROP POLICY IF EXISTS "Authenticated users can view scanners" ON public.scanners;
DROP POLICY IF EXISTS "Authenticated users can manage scanners" ON public.scanners;

-- Daily QR codes policies
DROP POLICY IF EXISTS "Authenticated users can view daily_qr_codes" ON public.daily_qr_codes;
DROP POLICY IF EXISTS "Authenticated users can insert daily_qr_codes" ON public.daily_qr_codes;
DROP POLICY IF EXISTS "Authenticated users can update daily_qr_codes" ON public.daily_qr_codes;

-- =====================================================
-- STEP 4: Create strict owner-based RLS policies
-- =====================================================

-- WORKERS: Owner only
CREATE POLICY "Owner can view workers"
  ON public.workers FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Owner can insert workers"
  ON public.workers FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner can update workers"
  ON public.workers FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Owner can delete workers"
  ON public.workers FOR DELETE
  USING (owner_id = auth.uid());

-- ATTENDANCE: Owner only (via worker ownership)
CREATE POLICY "Owner can view attendance"
  ON public.attendance FOR SELECT
  USING (public.is_worker_owner(worker_id));

CREATE POLICY "Owner can insert attendance"
  ON public.attendance FOR INSERT
  WITH CHECK (public.is_worker_owner(worker_id));

CREATE POLICY "Owner can update attendance"
  ON public.attendance FOR UPDATE
  USING (public.is_worker_owner(worker_id));

-- INCIDENTS: Owner only (via worker ownership)
CREATE POLICY "Owner can view incidents"
  ON public.incidents FOR SELECT
  USING (public.is_worker_owner(worker_id));

CREATE POLICY "Owner can insert incidents"
  ON public.incidents FOR INSERT
  WITH CHECK (public.is_worker_owner(worker_id));

-- WORKER_NOTES: Owner only (via worker ownership)
CREATE POLICY "Owner can view worker notes"
  ON public.worker_notes FOR SELECT
  USING (public.is_worker_owner(worker_id));

CREATE POLICY "Owner can insert worker notes"
  ON public.worker_notes FOR INSERT
  WITH CHECK (public.is_worker_owner(worker_id));

CREATE POLICY "Owner can update worker notes"
  ON public.worker_notes FOR UPDATE
  USING (public.is_worker_owner(worker_id));

CREATE POLICY "Owner can delete worker notes"
  ON public.worker_notes FOR DELETE
  USING (public.is_worker_owner(worker_id));

-- SCANNERS: Owner only
CREATE POLICY "Owner can view scanners"
  ON public.scanners FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Owner can insert scanners"
  ON public.scanners FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner can update scanners"
  ON public.scanners FOR UPDATE
  USING (owner_id = auth.uid());

-- DAILY_QR_CODES: Owner can view only (inserts via edge function with service role)
CREATE POLICY "Owner can view daily_qr_codes"
  ON public.daily_qr_codes FOR SELECT
  USING (public.is_worker_owner(worker_id));