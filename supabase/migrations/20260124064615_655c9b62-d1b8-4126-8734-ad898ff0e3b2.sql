-- Create a table for day-specific schedule overrides
CREATE TABLE public.day_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME WITHOUT TIME ZONE NOT NULL,
  end_time TIME WITHOUT TIME ZONE NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(owner_id, day_of_week)
);

-- Enable RLS
ALTER TABLE public.day_schedules ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Owner can view day_schedules"
  ON public.day_schedules FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Owner can insert day_schedules"
  ON public.day_schedules FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner can update day_schedules"
  ON public.day_schedules FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Owner can delete day_schedules"
  ON public.day_schedules FOR DELETE
  USING (owner_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_day_schedules_updated_at
  BEFORE UPDATE ON public.day_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();