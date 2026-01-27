-- Add break_day column to workers table (0=Sunday, 1=Monday, ..., 6=Saturday)
ALTER TABLE public.workers 
ADD COLUMN break_day integer CHECK (break_day >= 0 AND break_day <= 6);

-- Add comment for clarity
COMMENT ON COLUMN public.workers.break_day IS 'Day of week for worker break (0=Sunday, 1=Monday, ..., 6=Saturday)';