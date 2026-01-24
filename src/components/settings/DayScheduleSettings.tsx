import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DaySchedule } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Plus, Trash2 } from 'lucide-react';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface DayScheduleFormData {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_enabled: boolean;
  id?: string;
}

export function DayScheduleSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schedules, setSchedules] = useState<DayScheduleFormData[]>([]);

  useEffect(() => {
    if (user) {
      fetchSchedules();
    }
  }, [user]);

  const fetchSchedules = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('day_schedules')
      .select('*')
      .eq('owner_id', user?.id)
      .order('day_of_week');

    if (error) {
      console.error('Error fetching day schedules:', error);
    } else {
      setSchedules((data || []).map((s: DaySchedule) => ({
        id: s.id,
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        is_enabled: s.is_enabled,
      })));
    }
    setLoading(false);
  };

  const getAvailableDays = () => {
    const usedDays = schedules.map(s => s.day_of_week);
    return DAY_NAMES.map((name, index) => ({ name, index }))
      .filter(d => !usedDays.includes(d.index));
  };

  const addSchedule = (dayIndex: number) => {
    setSchedules([...schedules, {
      day_of_week: dayIndex,
      start_time: '07:00',
      end_time: '19:00',
      is_enabled: true,
    }]);
  };

  const removeSchedule = async (index: number) => {
    const schedule = schedules[index];
    if (schedule.id) {
      const { error } = await supabase
        .from('day_schedules')
        .delete()
        .eq('id', schedule.id);
      if (error) {
        toast({ title: 'Error', description: 'Failed to delete schedule.', variant: 'destructive' });
        return;
      }
    }
    setSchedules(schedules.filter((_, i) => i !== index));
    toast({ title: 'Schedule removed' });
  };

  const updateSchedule = (index: number, field: keyof DayScheduleFormData, value: string | boolean | number) => {
    const updated = [...schedules];
    updated[index] = { ...updated[index], [field]: value };
    setSchedules(updated);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    try {
      for (const schedule of schedules) {
        if (schedule.id) {
          // Update existing
          const { error } = await supabase
            .from('day_schedules')
            .update({
              start_time: schedule.start_time,
              end_time: schedule.end_time,
              is_enabled: schedule.is_enabled,
            })
            .eq('id', schedule.id);
          if (error) throw error;
        } else {
          // Insert new
          const { error } = await supabase
            .from('day_schedules')
            .insert({
              owner_id: user.id,
              day_of_week: schedule.day_of_week,
              start_time: schedule.start_time,
              end_time: schedule.end_time,
              is_enabled: schedule.is_enabled,
            });
          if (error) throw error;
        }
      }
      toast({ title: 'Day schedules saved', description: 'Your day-specific hours have been updated.' });
      fetchSchedules(); // Refresh to get IDs
    } catch (error) {
      console.error('Error saving schedules:', error);
      toast({ title: 'Error', description: 'Failed to save schedules.', variant: 'destructive' });
    }
    setSaving(false);
  };

  const availableDays = getAvailableDays();

  if (loading) {
    return (
      <Card className="glass-card">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-brand-gold" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Day-Specific Hours</CardTitle>
        <CardDescription>
          Override default working hours for specific days (e.g., Friday early start).
          These will apply to all workers.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {schedules.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No day-specific schedules configured. All days use the default hours.
          </p>
        )}

        {schedules.map((schedule, index) => (
          <div key={schedule.id || schedule.day_of_week} className="border border-border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-medium text-foreground">
                  {DAY_NAMES[schedule.day_of_week]}
                </span>
                <Switch
                  checked={schedule.is_enabled}
                  onCheckedChange={(checked) => updateSchedule(index, 'is_enabled', checked)}
                />
                <span className="text-xs text-muted-foreground">
                  {schedule.is_enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeSchedule(index)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input
                  type="time"
                  value={schedule.start_time}
                  onChange={(e) => updateSchedule(index, 'start_time', e.target.value)}
                  disabled={!schedule.is_enabled}
                />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input
                  type="time"
                  value={schedule.end_time}
                  onChange={(e) => updateSchedule(index, 'end_time', e.target.value)}
                  disabled={!schedule.is_enabled}
                />
              </div>
            </div>
          </div>
        ))}

        {availableDays.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-muted-foreground self-center mr-2">Add day:</span>
            {availableDays.map((day) => (
              <Button
                key={day.index}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addSchedule(day.index)}
              >
                <Plus className="w-3 h-3 mr-1" />
                {day.name}
              </Button>
            ))}
          </div>
        )}

        {schedules.length > 0 && (
          <Button
            onClick={handleSave}
            className="w-full gradient-gold text-brand-black font-semibold hover:opacity-90"
            disabled={saving}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Day Schedules
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
