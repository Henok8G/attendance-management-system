-- Add owner_id to attendance table
ALTER TABLE public.attendance 
ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id);

-- Add owner_id to incidents table  
ALTER TABLE public.incidents 
ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id);

-- Add owner_id to daily_qr_codes table
ALTER TABLE public.daily_qr_codes 
ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_attendance_owner_id ON public.attendance(owner_id);
CREATE INDEX IF NOT EXISTS idx_incidents_owner_id ON public.incidents(owner_id);
CREATE INDEX IF NOT EXISTS idx_daily_qr_codes_owner_id ON public.daily_qr_codes(owner_id);

-- Ensure unique constraint on daily_qr_codes (worker_id, date, type)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'daily_qr_codes_worker_date_type_unique'
  ) THEN
    ALTER TABLE public.daily_qr_codes 
    ADD CONSTRAINT daily_qr_codes_worker_date_type_unique UNIQUE (worker_id, date, type);
  END IF;
END $$;

-- Backfill owner_id from workers table for existing records
UPDATE public.attendance a
SET owner_id = w.owner_id
FROM public.workers w
WHERE a.worker_id = w.id AND a.owner_id IS NULL;

UPDATE public.incidents i
SET owner_id = w.owner_id
FROM public.workers w
WHERE i.worker_id = w.id AND i.owner_id IS NULL;

UPDATE public.daily_qr_codes d
SET owner_id = w.owner_id
FROM public.workers w
WHERE d.worker_id = w.id AND d.owner_id IS NULL;

-- Drop old RLS policies and create new ones for attendance
DROP POLICY IF EXISTS "Owner can view attendance" ON public.attendance;
DROP POLICY IF EXISTS "Owner can insert attendance" ON public.attendance;
DROP POLICY IF EXISTS "Owner can update attendance" ON public.attendance;

CREATE POLICY "Owner can view attendance" 
ON public.attendance FOR SELECT
USING (is_worker_owner(worker_id));

CREATE POLICY "Owner can insert attendance" 
ON public.attendance FOR INSERT
WITH CHECK (is_worker_owner(worker_id));

CREATE POLICY "Owner can update attendance" 
ON public.attendance FOR UPDATE
USING (is_worker_owner(worker_id));

-- Drop old RLS policies and create new ones for incidents
DROP POLICY IF EXISTS "Owner can view incidents" ON public.incidents;
DROP POLICY IF EXISTS "Owner can insert incidents" ON public.incidents;

CREATE POLICY "Owner can view incidents" 
ON public.incidents FOR SELECT
USING (is_worker_owner(worker_id));

CREATE POLICY "Owner can insert incidents" 
ON public.incidents FOR INSERT
WITH CHECK (worker_id IS NULL OR is_worker_owner(worker_id));

-- Drop old RLS policies and create new ones for daily_qr_codes
DROP POLICY IF EXISTS "Owner can view daily_qr_codes" ON public.daily_qr_codes;

CREATE POLICY "Owner can view daily_qr_codes" 
ON public.daily_qr_codes FOR SELECT
USING (is_worker_owner(worker_id));

CREATE POLICY "Owner can insert daily_qr_codes" 
ON public.daily_qr_codes FOR INSERT
WITH CHECK (is_worker_owner(worker_id));

CREATE POLICY "Owner can update daily_qr_codes" 
ON public.daily_qr_codes FOR UPDATE
USING (is_worker_owner(worker_id));