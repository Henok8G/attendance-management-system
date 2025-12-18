-- Create enum for worker roles
CREATE TYPE public.worker_role AS ENUM ('barber', 'cleaner', 'receptionist', 'manager');

-- Create enum for attendance status
CREATE TYPE public.attendance_status AS ENUM ('in', 'out', 'late', 'absent');

-- Create workers table
CREATE TABLE public.workers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role worker_role NOT NULL DEFAULT 'barber',
  avatar_url TEXT,
  qr_secret TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  salary TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  custom_start_time TIME,
  custom_end_time TIME,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create scanners table
CREATE TABLE public.scanners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create attendance table
CREATE TABLE public.attendance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  scanner_id UUID REFERENCES public.scanners(id),
  check_in TIMESTAMP WITH TIME ZONE,
  check_out TIMESTAMP WITH TIME ZONE,
  status attendance_status NOT NULL DEFAULT 'in',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_late BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(worker_id, date)
);

-- Create incidents table for tracking issues
CREATE TABLE public.incidents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID REFERENCES public.workers(id) ON DELETE CASCADE,
  scanner_id UUID REFERENCES public.scanners(id),
  incident_type TEXT NOT NULL,
  description TEXT,
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create settings table for admin configuration
CREATE TABLE public.settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  default_start_time TIME NOT NULL DEFAULT '09:00',
  default_end_time TIME NOT NULL DEFAULT '18:00',
  late_threshold_minutes INTEGER NOT NULL DEFAULT 15,
  auto_refresh_interval INTEGER NOT NULL DEFAULT 15,
  realtime_enabled BOOLEAN NOT NULL DEFAULT true,
  show_incidents BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create admin profiles table
CREATE TABLE public.admin_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scanners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for workers (authenticated users only)
CREATE POLICY "Authenticated users can view workers" ON public.workers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert workers" ON public.workers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update workers" ON public.workers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete workers" ON public.workers FOR DELETE TO authenticated USING (true);

-- RLS Policies for scanners
CREATE POLICY "Authenticated users can view scanners" ON public.scanners FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage scanners" ON public.scanners FOR ALL TO authenticated USING (true);

-- RLS Policies for attendance
CREATE POLICY "Authenticated users can view attendance" ON public.attendance FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert attendance" ON public.attendance FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update attendance" ON public.attendance FOR UPDATE TO authenticated USING (true);

-- RLS Policies for incidents
CREATE POLICY "Authenticated users can view incidents" ON public.incidents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage incidents" ON public.incidents FOR ALL TO authenticated USING (true);

-- RLS Policies for settings
CREATE POLICY "Users can view their settings" ON public.settings FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Users can insert their settings" ON public.settings FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Users can update their settings" ON public.settings FOR UPDATE TO authenticated USING (owner_id = auth.uid());

-- RLS Policies for admin_profiles
CREATE POLICY "Users can view their profile" ON public.admin_profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert their profile" ON public.admin_profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update their profile" ON public.admin_profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Enable realtime for attendance table
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance;
ALTER PUBLICATION supabase_realtime ADD TABLE public.incidents;

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_workers_updated_at BEFORE UPDATE ON public.workers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_attendance_updated_at BEFORE UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_admin_profiles_updated_at BEFORE UPDATE ON public.admin_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user profile
CREATE OR REPLACE FUNCTION public.handle_new_admin_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name');
  
  INSERT INTO public.settings (owner_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$$;

-- Trigger for new admin user
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_admin_user();