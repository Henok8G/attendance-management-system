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

interface DateRangeOption {
  label: string;
  startDate: Date;
  endDate: Date;
  type: 'week' | 'month';
}

function getWeekOptions(): DateRangeOption[] {
  const options: DateRangeOption[] = [];
  const today = new Date();
  
  for (let i = 0; i < 8; i++) {
    const endDate = new Date(today);
    endDate.setDate(today.getDate() - (i * 7));
    
    const startDate = new Date(endDate);
    const dayOfWeek = startDate.getDay();
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startDate.setDate(startDate.getDate() - diffToMonday);
    
    const weekEnd = new Date(startDate);
    weekEnd.setDate(startDate.getDate() + 6);
    
    const label = i === 0 
      ? 'This Week' 
      : i === 1 
        ? 'Last Week' 
        : `Week (${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
    
    options.push({ label, startDate, endDate: weekEnd, type: 'week' });
  }
  
  return options;
}

const ETHIOPIAN_MONTHS = [
  'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
  'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
];

function toEthiopianDate(gDate: Date): { year: number; month: number; day: number } {
  const jdn = Math.floor(gDate.getTime() / 86400000 + 2440587.5);
  const r = ((jdn - 1723856) % 1461);
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  const year = 4 * Math.floor((jdn - 1723856) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460);
  const month = Math.floor(n / 30) + 1;
  const day = (n % 30) + 1;
  return { year, month, day };
}

function getEthiopianMonthLabel(gDate: Date): string {
  const eth = toEthiopianDate(gDate);
  const monthName = ETHIOPIAN_MONTHS[eth.month - 1] || 'Pagume';
  return `${monthName} ${eth.year}`;
}

function getMonthOptions(): DateRangeOption[] {
  const options: DateRangeOption[] = [];
  const today = new Date();
  
  for (let i = 0; i < 6; i++) {
    const startDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const endDate = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
    
    const ethLabel = getEthiopianMonthLabel(new Date(startDate.getFullYear(), startDate.getMonth(), 15));
    const label = i === 0 
      ? `This Month (${ethLabel})` 
      : i === 1 
        ? `Last Month (${ethLabel})` 
        : ethLabel;
    
    options.push({ label, startDate, endDate, type: 'month' });
  }
  
  return options;
}

export function WeeklyHistoryModal({ open, onClose, workers, settings }: WeeklyHistoryModalProps) {
  const [rangeMode, setRangeMode] = useState<'week' | 'month'>('week');
  const [selectedIndex, setSelectedIndex] = useState<string>('0');
  const [attendanceData, setAttendanceData] = useState<Record<string, Attendance[]>>({});
  const [loading, setLoading] = useState(false);
  const [permissionRequests, setPermissionRequests] = useState<PermissionRequest[]>([]);
  
  const rangeOptions = rangeMode === 'week' ? getWeekOptions() : getMonthOptions();
  const currentRange = rangeOptions[parseInt(selectedIndex)];
  
  // Reset selection when mode changes
  useEffect(() => {
    setSelectedIndex('0');
  }, [rangeMode]);
  
  useEffect(() => {
    if (open && currentRange) {
      fetchAttendance();
      fetchPermissions();
    }
  }, [open, selectedIndex, rangeMode]);
  
  const fetchAttendance = async () => {
    if (!currentRange) return;
    
    setLoading(true);
    const startDateStr = formatToYYYYMMDD(currentRange.startDate);
    const endDateStr = formatToYYYYMMDD(currentRange.endDate);
    
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .gte('date', startDateStr)
      .lte('date', endDateStr)
      .order('date', { ascending: true });
    
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
    if (!currentRange) return;
    const startDateStr = formatToYYYYMMDD(currentRange.startDate);
    const endDateStr = formatToYYYYMMDD(currentRange.endDate);
    
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

  const getRangeDays = (): Date[] => {
    if (!currentRange) return [];
    const days: Date[] = [];
    const start = new Date(currentRange.startDate);
    const end = new Date(currentRange.endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(new Date(d));
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
    if (!currentRange) return;
    
    const doc = new jsPDF({ orientation: 'landscape' });
    const days = getRangeDays();
    const title = rangeMode === 'month' ? 'Monthly Attendance Report' : 'Weekly Attendance Report';
    
    doc.setFontSize(16);
    doc.text(title, 14, 15);
    doc.setFontSize(11);
    doc.text(`${currentRange.startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} - ${currentRange.endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, 14, 22);
    
    const headers = ['Worker', ...days.map(d => d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })), 'Total Hours', 'Total Late'];
    
    const body = workers.map(worker => {
      const row = [worker.name];
      days.forEach(day => {
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
      
      const totalLate = calculateTotalLateMinutes(worker);
      row.push(totalLate > 0 ? formatLateTime(totalLate) : '-');
      
      return row;
    });
    
    autoTable(doc, {
      startY: 28,
      head: [headers],
      body,
      styles: { fontSize: rangeMode === 'month' ? 6 : 8, cellPadding: 2 },
      headStyles: { fillColor: [212, 175, 55] },
      columnStyles: { 0: { fontStyle: 'bold' } },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index > 0) {
          const cellText = String(data.cell.raw || '');
          if (cellText === 'Absent') {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
          } else if (cellText === 'Permission') {
            data.cell.styles.textColor = [37, 99, 235];
            data.cell.styles.fontStyle = 'bold';
          } else if (cellText === 'Break') {
            data.cell.styles.textColor = [59, 130, 246];
            data.cell.styles.fontStyle = 'italic';
          }
        }
      },
    });
    
    const prefix = rangeMode === 'month' ? 'Monthly' : 'Weekly';
    doc.save(`${prefix}_Attendance_${formatToYYYYMMDD(currentRange.startDate)}.pdf`);
  };
  
  const rangeDays = getRangeDays();
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-brand-gold" />
            {rangeMode === 'month' ? 'Monthly' : 'Weekly'} Attendance History
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-2">
            <Select value={rangeMode} onValueChange={(v) => setRangeMode(v as 'week' | 'month')}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="week">Weekly</SelectItem>
                <SelectItem value="month">Monthly</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={selectedIndex} onValueChange={setSelectedIndex}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {rangeOptions.map((option, index) => (
                  <SelectItem key={index} value={index.toString()}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
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
                  {rangeDays.map((day, i) => (
                    <TableHead key={i} className="text-center min-w-[60px]">
                      <div className="text-[10px]">{day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                      <div className="text-[9px] text-muted-foreground">{day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
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
                      {rangeDays.map((day, i) => {
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
