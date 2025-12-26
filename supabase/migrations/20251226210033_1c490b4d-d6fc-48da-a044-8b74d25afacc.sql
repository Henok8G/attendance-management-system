-- Add unique constraint to enforce one QR code per worker per day per type
ALTER TABLE public.daily_qr_codes 
ADD CONSTRAINT daily_qr_codes_worker_date_type_unique 
UNIQUE (worker_id, date, type);