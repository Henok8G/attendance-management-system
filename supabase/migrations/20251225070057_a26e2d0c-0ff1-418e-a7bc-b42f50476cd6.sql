-- Add email column to workers table if not exists
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS email text;

-- Create daily_qr_codes table for time-bound QR codes
CREATE TABLE IF NOT EXISTS public.daily_qr_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  date date NOT NULL,
  type text NOT NULL CHECK (type IN ('check_in', 'check_out')),
  qr_token text UNIQUE NOT NULL,
  valid_from timestamp with time zone NOT NULL,
  valid_until timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.daily_qr_codes ENABLE ROW LEVEL SECURITY;

-- RLS policies for daily_qr_codes
CREATE POLICY "Authenticated users can view daily_qr_codes"
  ON public.daily_qr_codes
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert daily_qr_codes"
  ON public.daily_qr_codes
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update daily_qr_codes"
  ON public.daily_qr_codes
  FOR UPDATE
  USING (true);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_daily_qr_codes_worker_date ON public.daily_qr_codes(worker_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_qr_codes_token ON public.daily_qr_codes(qr_token);

-- Enable realtime for daily_qr_codes
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_qr_codes;