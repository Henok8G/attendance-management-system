-- Create permission_requests table
CREATE TABLE public.permission_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL,
  staff_name TEXT NOT NULL,
  request_date DATE NOT NULL,
  request_time TIME,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.permission_requests ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow reading permission requests" ON public.permission_requests FOR SELECT USING (true);
CREATE POLICY "Service role can insert permission requests" ON public.permission_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can update permission requests" ON public.permission_requests FOR UPDATE USING (true);