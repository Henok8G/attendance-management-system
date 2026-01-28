import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Worker, Attendance, DAY_NAMES } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { formatTime, calculateHours, getWeekDates, formatDate, formatToYYYYMMDD } from '@/lib/timezone';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { SecureAvatar } from '@/components/ui/SecureAvatar';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Edit2, Power, FileText, ExternalLink, Clock, Coffee } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface WorkerModalProps {
  worker: Worker | null;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export function WorkerModal({ worker, open, onClose, onUpdate }: WorkerModalProps) {
  const { toast } = useToast();
  const [weeklyAttendance, setWeeklyAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({ name: '', salary: '', custom_start_time: '', custom_end_time: '' });

  useEffect(() => {
    if (worker && open) {
      setFormData({
        name: worker.name,
        salary: worker.salary || '',
        custom_start_time: worker.custom_start_time || '',
        custom_end_time: worker.custom_end_time || '',
      });
      fetchWeeklyAttendance();
    }
  }, [worker, open]);

  const fetchWeeklyAttendance = async () => {
    if (!worker) return;
    setLoading(true);
    const weekDates = getWeekDates(new Date());
    // Use the timezone-aware formatter to get correct YYYY-MM-DD strings
    const startDate = formatToYYYYMMDD(weekDates[0]);
    const endDate = formatToYYYYMMDD(weekDates[6]);

    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('worker_id', worker.id)
      .gte('date', startDate)
      .lte('date', endDate);

    setWeeklyAttendance((data as Attendance[]) || []);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!worker) return;
    const { error } = await supabase.from('workers').update({
      name: formData.name,
      salary: formData.salary || null,
      custom_start_time: formData.custom_start_time || null,
      custom_end_time: formData.custom_end_time || null,
    }).eq('id', worker.id);

    if (error) {
      toast({ title: 'Error', description: 'Failed to update worker.', variant: 'destructive' });
    } else {
      toast({ title: 'Worker updated' });
      setEditing(false);
      onUpdate();
    }
  };

  const handleToggleActive = async () => {
    if (!worker) return;
    const { error } = await supabase.from('workers').update({ is_active: !worker.is_active }).eq('id', worker.id);
    if (!error) {
      toast({ title: worker.is_active ? 'Worker deactivated' : 'Worker activated' });
      onUpdate();
      onClose();
    }
  };


  // Check if a date is this worker's break day
  const isBreakDay = (date: Date): boolean => {
    if (worker?.break_day === null || worker?.break_day === undefined) return false;
    return date.getDay() === worker.break_day;
  };

  const exportPDF = () => {
    if (!worker) return;
    const doc = new jsPDF();
    doc.text(`Weekly Report: ${worker.name}`, 14, 20);
    const weekDates = getWeekDates(new Date());
    autoTable(doc, {
      startY: 30,
      head: [['Date', 'Check In', 'Check Out', 'Hours', 'Status']],
      body: weekDates.map((d) => {
        const dateStr = formatToYYYYMMDD(d);
        const att = weeklyAttendance.find((a) => a.date === dateStr);
        const onBreak = isBreakDay(d);
        return [
          formatDate(d), 
          onBreak ? '-' : formatTime(att?.check_in), 
          onBreak ? '-' : formatTime(att?.check_out), 
          onBreak ? '-' : calculateHours(att?.check_in || null, att?.check_out || null),
          onBreak ? 'Break' : (att?.is_late ? 'Late' : att?.check_in ? 'Present' : 'Absent')
        ];
      }),
    });
    doc.save(`${worker.name}_weekly_report.pdf`);
  };

  if (!worker) return null;

  const weekDates = getWeekDates(new Date());

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <SecureAvatar
              avatarUrl={worker.avatar_url}
              fallbackText={worker.name}
              alt={worker.name}
              className="w-12 h-12"
            />
            <div>
              <span className="block">{worker.name}</span>
              <span className="text-sm font-normal text-muted-foreground capitalize">{worker.role}</span>
            </div>
            <Badge variant={worker.is_active ? 'default' : 'secondary'} className="ml-auto">
              {worker.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {editing ? (
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} /></div>
              <div><Label>Salary</Label><Input value={formData.salary} onChange={(e) => setFormData({ ...formData, salary: e.target.value })} placeholder="Monthly salary" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Start Time</Label><Input type="time" value={formData.custom_start_time} onChange={(e) => setFormData({ ...formData, custom_start_time: e.target.value })} /></div>
                <div><Label>End Time</Label><Input type="time" value={formData.custom_end_time} onChange={(e) => setFormData({ ...formData, custom_end_time: e.target.value })} /></div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave} className="flex-1 gradient-gold text-brand-black">Save</Button>
                <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground">Salary</p>
                  <p className="font-medium">{worker.salary || '—'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground flex items-center gap-1"><Coffee className="w-3 h-3" />Break Day</p>
                  <p className="font-medium">{worker.break_day !== null && worker.break_day !== undefined ? DAY_NAMES[worker.break_day] : 'None'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />Start Time</p>
                  <p className="font-medium">{worker.custom_start_time || '—'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />End Time</p>
                  <p className="font-medium">{worker.custom_end_time || '—'}</p>
                </div>
              </div>
              <h4 className="font-semibold pt-2">This Week</h4>
              {loading ? (
                <Loader2 className="w-6 h-6 animate-spin mx-auto" />
              ) : (
              <div className="space-y-2">
                {weekDates.map((d) => {
                  const dateStr = formatToYYYYMMDD(d);
                  const att = weeklyAttendance.find((a) => a.date === dateStr);
                  return (
                    <div key={dateStr} className="flex items-center justify-between text-sm py-1 border-b border-border/50">
                      <span className="font-medium">{formatDate(d)}</span>
                      <span>{formatTime(att?.check_in)} - {formatTime(att?.check_out)}</span>
                      <span className={att?.is_late ? 'text-status-late' : 'text-muted-foreground'}>{calculateHours(att?.check_in || null, att?.check_out || null)}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Edit2 className="w-4 h-4 mr-1" />Edit</Button>
              <Button variant="outline" size="sm" onClick={handleToggleActive}><Power className="w-4 h-4 mr-1" />{worker.is_active ? 'Deactivate' : 'Activate'}</Button>
              <Button variant="outline" size="sm" onClick={exportPDF}><FileText className="w-4 h-4 mr-1" />Export PDF</Button>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/workers/${worker.id}`}><ExternalLink className="w-4 h-4 mr-1" />Full Profile</Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </DialogContent>
  </Dialog>
);
}
