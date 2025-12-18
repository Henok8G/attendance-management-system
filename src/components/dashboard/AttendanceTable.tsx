import { AttendanceWithWorker, Incident, Worker } from '@/lib/types';
import { formatTime, calculateHours } from '@/lib/timezone';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Card } from '@/components/ui/card';
import { Eye, Download, Loader2, AlertTriangle } from 'lucide-react';
import QRCode from 'qrcode';

interface AttendanceTableProps {
  attendance: AttendanceWithWorker[];
  workers: Worker[];
  incidents: Incident[];
  loading: boolean;
  selectedDate: string;
  onWorkerClick: (worker: Worker) => void;
  onRefresh: () => void;
}

const statusClasses: Record<string, string> = {
  in: 'status-badge status-in',
  out: 'status-badge status-out',
  late: 'status-badge status-late',
  absent: 'status-badge status-absent',
};

export function AttendanceTable({ attendance, workers, incidents, loading, selectedDate, onWorkerClick }: AttendanceTableProps) {
  const downloadQR = async (worker: Worker) => {
    const qrData = `cmac:${worker.qr_secret}`;
    const url = await QRCode.toDataURL(qrData, { width: 300, margin: 2 });
    const link = document.createElement('a');
    link.download = `${worker.name.replace(/\s+/g, '_')}_QR.png`;
    link.href = url;
    link.click();
  };

  const getWorkerIncident = (workerId: string) => {
    return incidents.find((i) => i.worker_id === workerId);
  };

  // Combine attendance with absent workers
  const attendanceMap = new Map(attendance.map((a) => [a.worker_id, a]));
  const allWorkerRows = workers.map((worker) => {
    const att = attendanceMap.get(worker.id);
    return {
      worker,
      attendance: att,
      status: att?.status || 'absent',
      isLate: att?.is_late || false,
    };
  });

  // Sort by status
  const statusOrder = { in: 0, late: 1, out: 2, absent: 3 };
  allWorkerRows.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

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
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allWorkerRows.map(({ worker, attendance: att, status, isLate }) => {
              const incident = getWorkerIncident(worker.id);
              const displayStatus = isLate ? 'late' : status;

              return (
                <TableRow key={worker.id} className={incident ? 'bg-status-late/5' : ''}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-medium text-sm">
                        {worker.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium">{worker.name}</p>
                        {incident && (
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
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => onWorkerClick(worker)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => downloadQR(worker)}>
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
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
