import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DayScheduleSettings } from '@/components/settings/DayScheduleSettings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { settings, updateSettings, loading: settingsLoading } = useSettings();
  const { toast } = useToast();

  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    default_start_time: settings?.default_start_time || '09:00',
    default_end_time: settings?.default_end_time || '18:00',
    late_threshold_minutes: settings?.late_threshold_minutes || 15,
    auto_refresh_interval: settings?.auto_refresh_interval || 15,
    realtime_enabled: settings?.realtime_enabled ?? true,
    show_incidents: settings?.show_incidents ?? true,
  });

  if (!authLoading && !user) {
    navigate('/auth');
    return null;
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings(formData);
      toast({
        title: 'Settings saved',
        description: 'Your preferences have been updated.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save settings.',
        variant: 'destructive',
      });
    }
    setSaving(false);
  };

  if (settingsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-brand-gold" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Link to="/dashboard" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Link>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-2xl font-display">Settings</CardTitle>
              <CardDescription>Configure your dashboard preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              {/* Working Hours */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Working Hours</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="start-time">Default Start Time</Label>
                    <Input
                      id="start-time"
                      type="time"
                      value={formData.default_start_time}
                      onChange={(e) => setFormData({ ...formData, default_start_time: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end-time">Default End Time</Label>
                    <Input
                      id="end-time"
                      type="time"
                      value={formData.default_end_time}
                      onChange={(e) => setFormData({ ...formData, default_end_time: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Late Threshold */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Late Policy</h3>
                <div className="space-y-2">
                  <Label htmlFor="late-threshold">Late Threshold (minutes after start time)</Label>
                  <Input
                    id="late-threshold"
                    type="number"
                    min={0}
                    max={120}
                    value={formData.late_threshold_minutes}
                    onChange={(e) => setFormData({ ...formData, late_threshold_minutes: parseInt(e.target.value) || 0 })}
                  />
                  <p className="text-sm text-muted-foreground">
                    Workers will be marked late if they check in after {formData.late_threshold_minutes} minutes past their start time.
                  </p>
                </div>
              </div>

              {/* Auto-refresh */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Data Refresh</h3>
                <div className="space-y-2">
                  <Label htmlFor="refresh-interval">Auto-refresh Interval (minutes)</Label>
                  <Input
                    id="refresh-interval"
                    type="number"
                    min={1}
                    max={60}
                    value={formData.auto_refresh_interval}
                    onChange={(e) => setFormData({ ...formData, auto_refresh_interval: parseInt(e.target.value) || 15 })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Realtime Updates</Label>
                    <p className="text-sm text-muted-foreground">Enable live updates when scans occur</p>
                  </div>
                  <Switch
                    checked={formData.realtime_enabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, realtime_enabled: checked })}
                  />
                </div>
              </div>

              {/* Display Options */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Display</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Show Incidents</Label>
                    <p className="text-sm text-muted-foreground">Highlight incident rows in the attendance table</p>
                  </div>
                  <Switch
                    checked={formData.show_incidents}
                    onCheckedChange={(checked) => setFormData({ ...formData, show_incidents: checked })}
                  />
                </div>
              </div>

              <Button
                onClick={handleSave}
                className="w-full gradient-gold text-brand-black font-semibold hover:opacity-90"
                disabled={saving}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Save Settings
              </Button>
            </CardContent>
          </Card>

          {/* Day-Specific Schedules */}
          <div className="mt-6">
            <DayScheduleSettings />
          </div>
        </motion.div>
      </main>
    </div>
  );
}
