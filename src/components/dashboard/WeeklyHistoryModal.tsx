import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { Worker, Attendance, DAY_NAMES, Settings } from '@/lib/types';
import { formatTime, calculateHours, formatDate, formatToYYYYMMDD, calculateLateMinutes, formatLateTime, parseTimeToMinutes } from '@/lib/timezone';
import { Badge } from '@/components/ui/badge';
import { Loader2, Download, Calendar, Clock } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PermissionRequest {
  id: string;
  staff_id: string;
  request_date: string;
  status: string;
}

interface WeeklyHistoryModalProps {
  open: boolean;
  onClose: () => void;
  workers: Worker[];
  settings?: Settings | null;
}

interface WeekOption {
  label: string;
  startDate: Date;
  endDate: Date;
}

function getWeekOptions(weeksBack: number = 8): WeekOption[] {
  const options: WeekOption[] = [];
  const today = new Date();
  
  for (let i = 0; i < weeksBack; i++) {
    const endDate = new Date(today);
    endDate.setDate(today.getDate() - (i * 7));
    
    // Get Monday of that week
    const startDate = new Date(endDate);
    const dayOfWeek = startDate.getDay();
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startDate.setDate(startDate.getDate() - diffToMonday);
    
    // Get Sunday of that week
    const weekEnd = new Date(startDate);
    weekEnd.setDate(startDate.getDate() + 6);
    
    const label = i === 0 
      ? 'This Week' 
      : i === 1 
        ? 'Last Week' 
        : `Week ${i + 1} (${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
    
    options.push({
      label,
      startDate,
      endDate: weekEnd,
    });
  }
  
  return options;
}

export function WeeklyHistoryModal({ open, onClose, workers, settings }: WeeklyHistoryModalProps) {
  const [selectedWeek, setSelectedWeek] = useState<string>('0');
  const [attendanceData, setAttendanceData] = useState<Record<string, Attendance[]>>({});
  const [loading, setLoading] = useState(false);
  const [permissionRequests, setPermissionRequests] = useState<PermissionRequest[]>([]);
  
  const weekOptions = getWeekOptions(8);
  const currentWeek = weekOptions[parseInt(selectedWeek)];
  
  useEffect(() => {
    if (open && currentWeek) {
      fetchWeeklyAttendance();
      fetchPermissions();
    }
  }, [open, selectedWeek]);
  
  const fetchWeeklyAttendance = async () => {
    if (!currentWeek) return;
    
    setLoading(true);
    const startDateStr = formatToYYYYMMDD(currentWeek.startDate);
    const endDateStr = formatToYYYYMMDD(currentWeek.endDate);
    
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .gte('date', startDateStr)
      .lte('date', endDateStr)
      .order('date', { ascending: true });
    
    // Group by worker
    const grouped: Record<string, Attendance[]> = {};
    (data || []).forEach((att: Attendance) => {
      if (!grouped[att.worker_id]) {
        grouped[att.worker_id] = [];
      }
      grouped[att.worker_id].push(att);
    });
    
    setAttendanceData(grouped);
    setLoading(false);
  };

  const fetchPermissions = async () => {
    if (!currentWeek) return;
    const startDateStr = formatToYYYYMMDD(currentWeek.startDate);
    const endDateStr = formatToYYYYMMDD(currentWeek.endDate);
    
    const { data } = await supabase
      .from('permission_requests')
      .select('id, staff_id, request_date, status')
      .gte('request_date', startDateStr)
      .lte('request_date', endDateStr)
      .eq('status', 'approved');
    setPermissionRequests((data as PermissionRequest[]) || []);
  };

  const hasPermission = (workerId: string, date: Date): boolean => {
    const dateStr = formatToYYYYMMDD(date);
    return permissionRequests.some(p => p.staff_id === workerId && p.request_date === dateStr);
  };

  const getWeekDays = (): Date[] => {
    if (!currentWeek) return [];
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(currentWeek.startDate);
      day.setDate(currentWeek.startDate.getDate() + i);
      days.push(day);
    }
    return days;
  };
  
  const getAttendanceForDay = (workerId: string, date: Date): Attendance | undefined => {
    const dateStr = formatToYYYYMMDD(date);
    return attendanceData[workerId]?.find(a => a.date === dateStr);
  };

  const isWorkerOnBreak = (worker: Worker, date: Date): boolean => {
    if (worker.break_day === null || worker.break_day === undefined) return false;
    return date.getDay() === worker.break_day;
  };
  
  const calculateTotalHours = (workerId: string): string => {
    const records = attendanceData[workerId] || [];
    let totalMinutes = 0;
    
    records.forEach(att => {
      if (att.check_in && att.check_out) {
        const checkIn = new Date(att.check_in);
        const checkOut = new Date(att.check_out);
        totalMinutes += (checkOut.getTime() - checkIn.getTime()) / (1000 * 60);
      }
    });
    
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);
    return `${hours}h ${minutes}m`;
  };

  const calculateTotalLateMinutes = (worker: Worker): number => {
    const records = attendanceData[worker.id] || [];
    let totalLate = 0;
    
    if (!settings) return 0;
    
    records.forEach(att => {
      if (att.is_late && att.check_in) {
        totalLate += calculateLateMinutes(
          att.check_in,
          settings.default_start_time,
          settings.late_threshold_minutes,
          worker.custom_start_time
        );
      }
    });
    
    return totalLate;
  };
  
  const exportToPDF = () => {
    if (!currentWeek) return;
    
    const doc = new jsPDF({ orientation: 'landscape' });
    const weekDays = getWeekDays();
    
    doc.setFontSize(16);
    doc.text(`Weekly Attendance Report`, 14, 15);
    doc.setFontSize(11);
    doc.text(`${currentWeek.startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} - ${currentWeek.endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, 14, 22);
    
    const headers = ['Worker', ...weekDays.map(d => d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })), 'Total Hours', 'Total Late'];
    
    const body = workers.map(worker => {
      const row = [worker.name];
      weekDays.forEach(day => {
        const att = getAttendanceForDay(worker.id, day);
        const onBreak = isWorkerOnBreak(worker, day);
        const onPermission = hasPermission(worker.id, day);
        if (onPermission) {
          row.push('Permission');
        } else if (att) {
          const checkIn = formatTime(att.check_in) || '-';
          const checkOut = formatTime(att.check_out) || '-';
          row.push(`${checkIn}\n${checkOut}`);
        } else if (onBreak) {
          row.push('Break');
        } else {
          row.push('Absent');
        }
      });
      row.push(calculateTotalHours(worker.id));
      
      // Add total late time
      const totalLate = calculateTotalLateMinutes(worker);
      row.push(totalLate > 0 ? formatLateTime(totalLate) : '-');
      
      return row;
    });
    
    autoTable(doc, {
      startY: 28,
      head: [headers],
      body,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [212, 175, 55] },
      columnStyles: { 0: { fontStyle: 'bold' } },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index > 0) {
          const cellText = String(data.cell.raw || '');
          if (cellText === 'Absent') {
            data.cell.styles.textColor = [220, 38, 38]; // red
            data.cell.styles.fontStyle = 'bold';
          } else if (cellText === 'Permission') {
            data.cell.styles.textColor = [37, 99, 235]; // blue
            data.cell.styles.fontStyle = 'bold';
          } else if (cellText === 'Break') {
            data.cell.styles.textColor = [59, 130, 246]; // lighter blue
            data.cell.styles.fontStyle = 'italic';
          }
        }
      },
    });
    
    doc.save(`Weekly_Attendance_${formatToYYYYMMDD(currentWeek.startDate)}.pdf`);
  };
  
  const weekDays = getWeekDays();
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-brand-gold" />
            Weekly Attendance History
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex items-center justify-between gap-4 py-4">
          <Select value={selectedWeek} onValueChange={setSelectedWeek}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Select week" />
            </SelectTrigger>
            <SelectContent className="bg-background z-50">
              {weekOptions.map((option, index) => (
                <SelectItem key={index} value={index.toString()}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button onClick={exportToPDF} className="gradient-gold text-brand-black gap-2">
            <Download className="w-4 h-4" />
            Export PDF
          </Button>
        </div>
        
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-brand-gold" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10">Worker</TableHead>
                  {weekDays.map((day, i) => (
                    <TableHead key={i} className="text-center min-w-[100px]">
                      <div>{day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                      <div className="text-xs text-muted-foreground">{day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                    </TableHead>
                  ))}
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">Late</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workers.map(worker => {
                  const totalLate = calculateTotalLateMinutes(worker);
                  return (
                    <TableRow key={worker.id}>
                      <TableCell className="sticky left-0 bg-background z-10 font-medium">
                        {worker.name}
                      </TableCell>
                      {weekDays.map((day, i) => {
                        const att = getAttendanceForDay(worker.id, day);
                        const onBreak = isWorkerOnBreak(worker, day);
                        const onPermission = hasPermission(worker.id, day);
                        return (
                          <TableCell key={i} className="text-center">
                            {onPermission ? (
                              <Badge variant="secondary" className="bg-[hsl(var(--status-permission)/0.15)] text-status-permission text-[10px]">Permission</Badge>
                            ) : att ? (
                              <div className="text-xs space-y-1">
                                <div className="text-status-in">{formatTime(att.check_in) || '-'}</div>
                                <div className="text-status-out">{formatTime(att.check_out) || '-'}</div>
                                {att.is_late && <span className="text-status-late text-[10px]">LATE</span>}
                              </div>
                            ) : onBreak ? (
                              <Badge variant="secondary" className="bg-secondary text-secondary-foreground text-[10px]">Break</Badge>
                            ) : (
                              <span className="text-status-absent text-xs font-medium">Absent</span>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center font-medium">
                        {calculateTotalHours(worker.id)}
                      </TableCell>
                      <TableCell className="text-center">
                        {totalLate > 0 ? (
                          <span className="flex items-center justify-center gap-1 text-status-late text-sm">
                            <Clock className="w-3 h-3" />
                            {formatLateTime(totalLate)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
