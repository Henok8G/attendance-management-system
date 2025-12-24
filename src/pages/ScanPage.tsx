import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Scissors, CheckCircle, XCircle, Clock, Loader2, AlertTriangle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

type ScanResult = {
  success: boolean;
  action?: 'check_in' | 'check_out' | 'already_checked_out';
  status?: 'in' | 'out' | 'late';
  worker_name?: string;
  is_late?: boolean;
  message?: string;
  error?: string;
};

export default function ScanPage() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<ScanResult | null>(null);

  useEffect(() => {
    const qrSecret = searchParams.get('secret');
    const scannerId = searchParams.get('scanner');

    if (!qrSecret) {
      setResult({ success: false, error: 'Invalid QR code - no secret provided' });
      setLoading(false);
      return;
    }

    // Process the scan
    const processScan = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('scan-attendance', {
          body: { qr_secret: qrSecret, scanner_id: scannerId },
        });

        if (error) {
          console.error('Edge function error:', error);
          setResult({ success: false, error: error.message || 'Failed to process scan' });
        } else {
          setResult(data as ScanResult);
        }
      } catch (err) {
        console.error('Scan error:', err);
        setResult({ success: false, error: 'Network error - please try again' });
      } finally {
        setLoading(false);
      }
    };

    processScan();
  }, [searchParams]);

  const getStatusIcon = () => {
    if (loading) return <Loader2 className="w-16 h-16 animate-spin text-brand-gold" />;
    if (!result?.success) return <XCircle className="w-16 h-16 text-status-late" />;
    if (result.action === 'already_checked_out') return <AlertTriangle className="w-16 h-16 text-brand-gold" />;
    if (result.is_late) return <Clock className="w-16 h-16 text-status-late" />;
    return <CheckCircle className="w-16 h-16 text-status-in" />;
  };

  const getStatusMessage = () => {
    if (loading) return 'Processing scan...';
    if (!result?.success) return result?.error || 'Scan failed';
    if (result.action === 'already_checked_out') return result.message || 'Already checked out';
    if (result.action === 'check_in') {
      return result.is_late ? 'Checked In (Late)' : 'Checked In';
    }
    return 'Checked Out';
  };

  const getStatusColor = () => {
    if (loading) return 'text-muted-foreground';
    if (!result?.success) return 'text-status-late';
    if (result.action === 'already_checked_out') return 'text-brand-gold';
    if (result.is_late) return 'text-status-late';
    if (result.action === 'check_in') return 'text-status-in';
    return 'text-status-out';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden p-4">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-brand-gold/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] bg-brand-green/5 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md"
      >
        <Card className="glass-card p-8 text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-xl gradient-gold mb-6 shadow-glow mx-auto"
          >
            <Scissors className="w-8 h-8 text-brand-black" />
          </motion.div>

          <h1 className="text-2xl font-display font-bold text-foreground mb-2">
            C-Mac Barbershop
          </h1>
          <p className="text-muted-foreground mb-8">Attendance Scanner</p>

          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="flex flex-col items-center gap-4 mb-8"
          >
            {getStatusIcon()}
            
            {result?.worker_name && result.success && (
              <p className="text-xl font-semibold text-foreground">
                {result.worker_name}
              </p>
            )}

            <p className={`text-xl font-bold ${getStatusColor()}`}>
              {getStatusMessage()}
            </p>

            {result?.success && result.action !== 'already_checked_out' && (
              <p className="text-sm text-muted-foreground">
                {new Date().toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'Africa/Addis_Ababa',
                })}
              </p>
            )}
          </motion.div>

          <Link to="/">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Button>
          </Link>
        </Card>
      </motion.div>
    </div>
  );
}
