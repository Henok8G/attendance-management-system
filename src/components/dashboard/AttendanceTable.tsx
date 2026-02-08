import { useEffect, useState } from 'react';
import { AttendanceWithWorker, Incident, Worker, DAY_NAMES, Settings } from '@/lib/types';
import { formatTime, calculateHours, calculateLateMinutes, formatLateTime, formatToYYYYMMDD } from '@/lib/timezone';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Card } from '@/components/ui/card';
import { SecureAvatar } from '@/components/ui/SecureAvatar';
import { Download, Loader2, AlertTriangle, Coffee, Clock, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import QRCode from 'qrcode';

interface AttendanceTableProps {
  attendance: AttendanceWithWorker[];
  workers: Worker[];
  incidents: Incident[];
  loading: boolean;
  selectedDate: string;
  onWorkerClick: (worker: Worker) => void;
  onRefresh: () => void;
  settings?: Settings | null;
}

const statusClasses: Record<string, string> = {
  in: 'status-badge status-in',
  out: 'status-badge status-out',
  late: 'status-badge status-late',
  absent: 'status-badge status-absent',
  break: 'status-badge bg-blue-500/20 text-blue-400 border-blue-500/30',
  permission: 'status-badge status-permission',
};

interface PermissionRequest {
  id: string;
  staff_id: string;
  request_date: string;
  status: string;
}

export function AttendanceTable({ attendance, workers, incidents, loading, selectedDate, onWorkerClick, settings }: AttendanceTableProps) {
  const [permissionRequests, setPermissionRequests] = useState<PermissionRequest[]>([]);

  useEffect(() => {
    const fetchPermissions = async () => {
      const { data } = await supabase
        .from('permission_requests')
        .select('id, staff_id, request_date, status')
        .eq('request_date', selectedDate)
        .eq('status', 'approved');
      setPermissionRequests((data as PermissionRequest[]) || []);
    };
    fetchPermissions();
  }, [selectedDate]);

  const hasPermission = (workerId: string): boolean => {
    return permissionRequests.some(p => p.staff_id === workerId);
  };

  const downloadQR = async (worker: Worker) => {
    // Generate QR code with scan URL
    const scanUrl = `${window.location.origin}/scan?secret=${encodeURIComponent(worker.qr_secret)}`;
    const url = await QRCode.toDataURL(scanUrl, { width: 300, margin: 2 });
    const link = document.createElement('a');
    link.download = `${worker.name.replace(/\s+/g, '_')}_QR.png`;
    link.href = url;
    link.click();
  };

  const getWorkerIncident = (workerId: string) => {
    return incidents.find((i) => {
      if (i.worker_id !== workerId) return false;
      // Only show incidents that occurred on the selected date
      const incidentDate = i.occurred_at.split('T')[0];
      return incidentDate === selectedDate;
    });
  };

  // Check if today is a worker's break day
  const isWorkerOnBreak = (worker: Worker, dateStr: string): boolean => {
    if (worker.break_day === null || worker.break_day === undefined) return false;
    const date = new Date(dateStr + 'T12:00:00'); // Use noon to avoid timezone issues
    return date.getDay() === worker.break_day;
  };

  // Combine attendance with absent workers
  const attendanceMap = new Map(attendance.map((a) => [a.worker_id, a]));
  const allWorkerRows = workers.map((worker) => {
    const att = attendanceMap.get(worker.id);
    const onBreak = isWorkerOnBreak(worker, selectedDate);
    
    // Calculate late minutes
    const lateMinutes = att?.is_late && settings ? calculateLateMinutes(
      att.check_in,
      settings.default_start_time,
      settings.late_threshold_minutes,
      worker.custom_start_time
    ) : 0;
    
    const onPermission = hasPermission(worker.id);
    
    return {
      worker,
      attendance: att,
      status: onBreak ? 'break' : onPermission ? 'permission' : (att?.status || 'absent'),
      isLate: att?.is_late || false,
      onBreak,
      onPermission,
      lateMinutes,
    };
  });

  // Sort by status
  const statusOrder: Record<string, number> = { in: 0, late: 1, out: 2, break: 3, permission: 4, absent: 5 };
  allWorkerRows.sort((a, b) => (statusOrder[a.status] ?? 6) - (statusOrder[b.status] ?? 6));

  if (loading) {
    return (
      <Card className="glass-card p-8 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-gold" />
      </Card>
    );
  }

  if (allWorkerRows.length === 0) {
    return (
      <Card className="glass-card p-8 text-center">
        <p className="text-muted-foreground">No workers found.</p>
      </Card>
    );
  }

  return (
    <Card className="glass-card overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Worker</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Check In</TableHead>
              <TableHead>Check Out</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Hours</TableHead>
              <TableHead>Late By</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allWorkerRows.map(({ worker, attendance: att, status, isLate, onBreak, onPermission, lateMinutes }) => {
              const incident = getWorkerIncident(worker.id);
              const displayStatus = onBreak ? 'break' : onPermission ? 'permission' : (isLate ? 'late' : status);

              return (
                <TableRow key={worker.id} className={incident ? 'bg-status-late/5' : ''}>
                  <TableCell>
                    <div 
                      className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => onWorkerClick(worker)}
                    >
                      <SecureAvatar
                        avatarUrl={worker.avatar_url}
                        fallbackText={worker.name}
                        alt={worker.name}
                        className="w-9 h-9"
                        fallbackClassName="bg-primary text-primary-foreground font-medium text-sm"
                      />
                      <div>
                        <p className="font-medium">{worker.name}</p>
                        {onBreak && worker.break_day !== null && (
                          <span className="text-xs text-blue-400 flex items-center gap-1">
                            <Coffee className="w-3 h-3" />
                            {DAY_NAMES[worker.break_day]} Break
                          </span>
                        )}
                        {onPermission && !onBreak && (
                          <span className="text-xs text-status-permission flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3" />
                            Permission
                          </span>
                        )}
                        {incident && !onBreak && (
                          <Tooltip>
                            <TooltipTrigger>
                              <span className="text-xs text-status-late flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                {incident.incident_type}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{incident.description || incident.incident_type}</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="capitalize">{worker.role}</TableCell>
                  <TableCell>{formatTime(att?.check_in)}</TableCell>
                  <TableCell>{formatTime(att?.check_out)}</TableCell>
                  <TableCell>
                    <span className={statusClasses[displayStatus]}>
                      {displayStatus.toUpperCase()}
                    </span>
                  </TableCell>
                  <TableCell>{calculateHours(att?.check_in || null, att?.check_out || null)}</TableCell>
                  <TableCell>
                    {lateMinutes > 0 ? (
                      <span className="flex items-center gap-1 text-status-late text-sm">
                        <Clock className="w-3 h-3" />
                        {formatLateTime(lateMinutes)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => downloadQR(worker)}>
                      <Download className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
