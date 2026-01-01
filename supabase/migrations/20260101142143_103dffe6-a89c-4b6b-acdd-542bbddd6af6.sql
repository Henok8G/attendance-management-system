-- Create qr_email_delivery table for tracking email deliveries
CREATE TABLE public.qr_email_delivery (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  qr_code_id UUID NOT NULL REFERENCES public.daily_qr_codes(id) ON DELETE CASCADE,
  qr_token TEXT NOT NULL,
  email_address TEXT NOT NULL,
  email_sent_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'retrying')),
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  owner_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for efficient queries
CREATE INDEX idx_qr_email_delivery_worker_id ON public.qr_email_delivery(worker_id);
CREATE INDEX idx_qr_email_delivery_qr_code_id ON public.qr_email_delivery(qr_code_id);
CREATE INDEX idx_qr_email_delivery_status ON public.qr_email_delivery(status);
CREATE INDEX idx_qr_email_delivery_owner_id ON public.qr_email_delivery(owner_id);

-- Unique constraint to prevent duplicate emails for the same QR code
CREATE UNIQUE INDEX idx_qr_email_delivery_unique ON public.qr_email_delivery(qr_code_id);

-- Enable RLS
ALTER TABLE public.qr_email_delivery ENABLE ROW LEVEL SECURITY;

-- RLS policies for owner access only
CREATE POLICY "Owner can view qr_email_delivery"
ON public.qr_email_delivery
FOR SELECT
USING (owner_id = auth.uid());

CREATE POLICY "Owner can insert qr_email_delivery"
ON public.qr_email_delivery
FOR INSERT
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner can update qr_email_delivery"
ON public.qr_email_delivery
FOR UPDATE
USING (owner_id = auth.uid());

-- Add trigger for updated_at
CREATE TRIGGER update_qr_email_delivery_updated_at
BEFORE UPDATE ON public.qr_email_delivery
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();