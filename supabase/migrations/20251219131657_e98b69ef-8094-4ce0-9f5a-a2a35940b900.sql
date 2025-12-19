-- Add missing columns to workers table (only if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workers' AND column_name = 'birthdate') THEN
    ALTER TABLE public.workers ADD COLUMN birthdate date;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workers' AND column_name = 'description') THEN
    ALTER TABLE public.workers ADD COLUMN description text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workers' AND column_name = 'employment_type') THEN
    ALTER TABLE public.workers ADD COLUMN employment_type text DEFAULT 'full_time';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workers' AND column_name = 'contract_end_date') THEN
    ALTER TABLE public.workers ADD COLUMN contract_end_date date;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workers' AND column_name = 'hire_date') THEN
    ALTER TABLE public.workers ADD COLUMN hire_date date;
  END IF;
END $$;

-- Create worker_notes table if not exists
CREATE TABLE IF NOT EXISTS public.worker_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid REFERENCES public.workers(id) ON DELETE CASCADE NOT NULL,
  author_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Enable RLS on worker_notes
ALTER TABLE public.worker_notes ENABLE ROW LEVEL SECURITY;

-- RLS policies for worker_notes (only authenticated users)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'worker_notes' AND policyname = 'Authenticated users can view worker notes') THEN
    CREATE POLICY "Authenticated users can view worker notes" ON public.worker_notes FOR SELECT USING (true);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'worker_notes' AND policyname = 'Authenticated users can insert worker notes') THEN
    CREATE POLICY "Authenticated users can insert worker notes" ON public.worker_notes FOR INSERT WITH CHECK (true);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'worker_notes' AND policyname = 'Authenticated users can update worker notes') THEN
    CREATE POLICY "Authenticated users can update worker notes" ON public.worker_notes FOR UPDATE USING (true);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'worker_notes' AND policyname = 'Authenticated users can delete worker notes') THEN
    CREATE POLICY "Authenticated users can delete worker notes" ON public.worker_notes FOR DELETE USING (true);
  END IF;
END $$;

-- Add trigger for updated_at on worker_notes
DROP TRIGGER IF EXISTS update_worker_notes_updated_at ON public.worker_notes;
CREATE TRIGGER update_worker_notes_updated_at
  BEFORE UPDATE ON public.worker_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add phone and bio to admin_profiles if missing
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admin_profiles' AND column_name = 'phone') THEN
    ALTER TABLE public.admin_profiles ADD COLUMN phone text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admin_profiles' AND column_name = 'bio') THEN
    ALTER TABLE public.admin_profiles ADD COLUMN bio text;
  END IF;
END $$;