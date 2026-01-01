import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Scissors, CheckCircle, XCircle, Clock, Loader2, AlertTriangle, ArrowLeft, LogIn, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

type ScanResult = {
  success: boolean;
  valid?: boolean;
  action?: 'check_in' | 'check_out' | 'already_checked_out';
  status?: 'in' | 'out' | 'late' | 'absent';
  worker_id?: string;
  worker_name?: string;
  is_late?: boolean;
  is_early_checkout?: boolean;
  incident_created?: boolean;
  check_in?: string;
  check_out?: string;
  timestamp?: string;
  time?: string;
  message?: string;
  error?: string;
  incident_logged?: boolean;
  used_at?: string;
};

export default function ScanPage() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<ScanResult | null>(null);

  useEffect(() => {
    const qrToken = searchParams.get('token');
    const qrSecret = searchParams.get('secret');
    const scannerId = searchParams.get('scanner');

    if (!qrToken && !qrSecret) {
      setResult({ success: false, error: 'Invalid QR code - no token provided' });
      setLoading(false);
      return;
    }

    const processScan = async () => {
      try {
        // Use validate-qr-scan for token-based QR codes, scan-attendance for legacy
        const functionName = qrToken ? 'validate-qr-scan' : 'scan-attendance';
        const body = qrToken 
          ? { qr_token: qrToken, scanner_id: scannerId || null }
          : { qr_secret: qrSecret, scanner_id: scannerId || null };

        console.log(`Calling ${functionName} with:`, body);

        const { data, error } = await supabase.functions.invoke(functionName, { body });

        if (error) {
          console.error('Edge function error:', error);
          setResult({ 
            success: false, 
            error: error.message || 'Failed to process scan' 
          });
        } else {
          console.log('Scan result:', data);
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

  const isSuccess = result?.success || result?.valid;

  const getStatusIcon = () => {
    if (loading) {
      return <Loader2 className="w-16 h-16 animate-spin text-brand-gold" />;
    }
    if (!isSuccess) {
      return <XCircle className="w-16 h-16 text-status-late" />;
    }
    if (result?.action === 'already_checked_out') {
      return <AlertTriangle className="w-16 h-16 text-brand-gold" />;
    }
    if (result?.is_late) {
      return <Clock className="w-16 h-16 text-status-late" />;
    }
    if (result?.is_early_checkout) {
      return <AlertTriangle className="w-16 h-16 text-status-late" />;
    }
    if (result?.action === 'check_in') {
      return <LogIn className="w-16 h-16 text-status-in" />;
    }
    if (result?.action === 'check_out') {
      return <LogOut className="w-16 h-16 text-status-out" />;
    }
    return <CheckCircle className="w-16 h-16 text-status-in" />;
  };

  const getStatusMessage = () => {
    if (loading) return 'Processing scan...';
    if (!isSuccess) return result?.error || 'Scan failed';
    
    if (result?.action === 'already_checked_out') {
      return 'Already Checked Out';
    }
    
    if (result?.action === 'check_in') {
      if (result?.is_late) {
        return 'Checked In (Late)';
      }
      return 'Checked In';
    }
    
    if (result?.action === 'check_out') {
      if (result?.is_early_checkout) {
        return 'Checked Out (Early)';
      }
      return 'Checked Out';
    }
    
    return result?.status === 'late' ? 'Checked In (Late)' : 
           result?.status === 'in' ? 'Checked In' :
           result?.status === 'out' ? 'Checked Out' : 'Success';
  };

  const getStatusColor = () => {
    if (loading) return 'text-muted-foreground';
    if (!isSuccess) return 'text-status-late';
    if (result?.action === 'already_checked_out') return 'text-brand-gold';
    if (result?.is_late || result?.is_early_checkout) return 'text-status-late';
    if (result?.action === 'check_in' || result?.status === 'in') return 'text-status-in';
    if (result?.action === 'check_out' || result?.status === 'out') return 'text-status-out';
    return 'text-status-in';
  };

  const getBackgroundGradient = () => {
    if (loading) return 'from-brand-gold/10 to-transparent';
    if (!isSuccess) return 'from-status-late/10 to-transparent';
    if (result?.is_late || result?.is_early_checkout) return 'from-status-late/10 to-transparent';
    if (result?.action === 'check_out' || result?.status === 'out') return 'from-status-out/10 to-transparent';
    return 'from-status-in/10 to-transparent';
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return null;
    try {
      return new Date(isoString).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Addis_Ababa',
      });
    } catch {
      return null;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden p-4">
      {/* Background effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className={`absolute top-1/3 left-1/4 w-[500px] h-[500px] rounded-full blur-3xl bg-gradient-radial ${getBackgroundGradient()}`} />
        <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] bg-brand-green/5 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md"
      >
        <Card className="glass-card p-8 text-center">
          {/* Logo */}
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

          {/* Status Display */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="flex flex-col items-center gap-4 mb-8"
          >
            <div className="p-4 rounded-full bg-card border border-border">
              {getStatusIcon()}
            </div>
            
            {result?.worker_name && isSuccess && (
              <p className="text-xl font-semibold text-foreground">
                {result.worker_name}
              </p>
            )}

            <p className={`text-2xl font-bold ${getStatusColor()}`}>
              {getStatusMessage()}
            </p>

            {/* Time display */}
            {isSuccess && result?.action !== 'already_checked_out' && (
              <div className="text-sm text-muted-foreground space-y-1">
                {result?.action === 'check_in' && result?.timestamp && (
                  <p>Check-in: {formatTime(result.timestamp)}</p>
                )}
                {result?.action === 'check_out' && (
                  <>
                    {result?.check_in && <p>Check-in: {formatTime(result.check_in)}</p>}
                    {result?.timestamp && <p>Check-out: {formatTime(result.timestamp)}</p>}
                  </>
                )}
              </div>
            )}

            {/* Incident warning */}
            {(result?.incident_logged || result?.incident_created) && (
              <div className="flex items-center gap-2 text-sm text-status-late bg-status-late/10 px-3 py-2 rounded-md">
                <AlertTriangle className="w-4 h-4" />
                <span>Incident recorded</span>
              </div>
            )}

            {/* Error details */}
            {!isSuccess && result?.error && (
              <p className="text-sm text-muted-foreground max-w-xs">
                {result.error}
              </p>
            )}
          </motion.div>

          {/* Back button */}
          <Link to="/">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Button>
          </Link>
        </Card>

        {/* Success animation overlay */}
        {isSuccess && !loading && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div className={`w-32 h-32 rounded-full ${result?.is_late || result?.is_early_checkout ? 'bg-status-late/20' : 'bg-status-in/20'}`} />
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
