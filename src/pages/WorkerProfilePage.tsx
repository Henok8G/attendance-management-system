import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Worker, Attendance, Incident, WorkerNote, WorkerRole, EmploymentType, DailyQRCode, DAY_NAMES } from '@/lib/types';
import { 
  formatTime, calculateHours, getWeekDates, formatDate, formatFullDate, 
  calculateAge, formatContractDuration, getContractStatus, formatToYYYYMMDD 
} from '@/lib/timezone';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { SecureAvatarWithPreview } from '@/components/ui/SecureAvatarWithPreview';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, Edit2, Power, Download, FileText, Plus, Trash2, 
  Loader2, Calendar, Clock, Briefcase, AlertTriangle, Upload, X,
  Mail, QrCode, Send, RefreshCw
} from 'lucide-react';
import QRCode from 'qrcode';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function WorkerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [worker, setWorker] = useState<Worker | null>(null);
  const [weeklyAttendance, setWeeklyAttendance] = useState<Attendance[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [notes, setNotes] = useState<WorkerNote[]>([]);
  const [todayQRCodes, setTodayQRCodes] = useState<DailyQRCode[]>([]);
  const [permissionDates, setPermissionDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generatingQR, setGeneratingQR] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    role: 'barber' as WorkerRole,
    salary: '',
    description: '',
    birthdate: '',
    employment_type: 'full_time' as EmploymentType,
    contract_end_date: '',
    hire_date: '',
    custom_start_time: '',
    custom_end_time: '',
    email: '',
    break_day: '' as string,
  });

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
      return;
    }
    if (id) fetchWorkerData();
  }, [id, user, authLoading]);

  const fetchWorkerData = async () => {
    if (!id) return;
    setLoading(true);

    // Fetch worker
    const { data: workerData, error: workerError } = await supabase
      .from('workers')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (workerError || !workerData) {
      toast({ title: 'Error', description: 'Worker not found.', variant: 'destructive' });
      navigate('/workers');
      return;
    }

    const w = workerData as Worker;
    setWorker(w);
    setPhotoPreview(w.avatar_url);
    setFormData({
      name: w.name,
      role: w.role,
      salary: w.salary || '',
      description: w.description || '',
      birthdate: w.birthdate || '',
      employment_type: (w.employment_type as EmploymentType) || 'full_time',
      contract_end_date: w.contract_end_date || '',
      hire_date: w.hire_date || '',
      custom_start_time: w.custom_start_time || '',
      custom_end_time: w.custom_end_time || '',
      email: w.email || '',
      break_day: w.break_day !== null && w.break_day !== undefined ? String(w.break_day) : '',
    });

    // Fetch weekly attendance
    const weekDates = getWeekDates(new Date());
    const startDate = formatToYYYYMMDD(weekDates[0]);
    const endDate = formatToYYYYMMDD(weekDates[6]);

    const { data: attendanceData } = await supabase
      .from('attendance')
      .select('*')
      .eq('worker_id', id)
      .gte('date', startDate)
      .lte('date', endDate);

    setWeeklyAttendance((attendanceData as Attendance[]) || []);

    // Fetch incidents for this worker
    const { data: incidentsData } = await supabase
      .from('incidents')
      .select('*')
      .eq('worker_id', id)
      .order('occurred_at', { ascending: false })
      .limit(20);

    setIncidents((incidentsData as Incident[]) || []);

    // Fetch notes
    const { data: notesData } = await supabase
      .from('worker_notes')
      .select('*')
      .eq('worker_id', id)
      .order('created_at', { ascending: false });

    setNotes((notesData as WorkerNote[]) || []);

    // Fetch today's QR codes
    const today = formatToYYYYMMDD(new Date());
    const { data: qrData } = await supabase
      .from('daily_qr_codes')
      .select('*')
      .eq('worker_id', id)
      .eq('date', today);

    setTodayQRCodes((qrData as DailyQRCode[]) || []);

    // Fetch permission requests for this week
    const permWeekDates = getWeekDates(new Date());
    const permStartDate = formatToYYYYMMDD(permWeekDates[0]);
    const permEndDate = formatToYYYYMMDD(permWeekDates[6]);
    const { data: permData } = await supabase
      .from('permission_requests')
      .select('request_date')
      .eq('staff_id', id)
      .eq('status', 'approved')
      .gte('request_date', permStartDate)
      .lte('request_date', permEndDate);
    setPermissionDates((permData || []).map((p: any) => p.request_date));

    setLoading(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: 'File too large', description: 'Photo must be under 5MB.', variant: 'destructive' });
        return;
      }
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const uploadPhoto = async (): Promise<string | null> => {
    if (!photoFile || !worker) return worker?.avatar_url || null;

    setUploading(true);
    const fileExt = photoFile.name.split('.').pop();
    const fileName = `${worker.id}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('worker-photos')
      .upload(fileName, photoFile, { upsert: true });

    setUploading(false);

    if (uploadError) {
      toast({ title: 'Upload failed', description: uploadError.message, variant: 'destructive' });
      return worker?.avatar_url || null;
    }

    // Store just the file path, not the full URL
    // The client will generate signed URLs as needed
    return fileName;
  };

  const handleSave = async () => {
    if (!worker) return;

    let avatarUrl = worker.avatar_url;
    if (photoFile) {
      avatarUrl = await uploadPhoto();
    }

    const { error } = await supabase.from('workers').update({
      name: formData.name,
      role: formData.role,
      salary: formData.salary || null,
      description: formData.description || null,
      birthdate: formData.birthdate || null,
      employment_type: formData.employment_type,
      contract_end_date: formData.contract_end_date || null,
      hire_date: formData.hire_date || null,
      custom_start_time: formData.custom_start_time || null,
      custom_end_time: formData.custom_end_time || null,
      email: formData.email || null,
      break_day: formData.break_day !== '' ? parseInt(formData.break_day, 10) : null,
      avatar_url: avatarUrl,
    }).eq('id', worker.id);

    if (error) {
      toast({ title: 'Error', description: 'Failed to update worker.', variant: 'destructive' });
    } else {
      toast({ title: 'Worker updated' });
      setEditing(false);
      setPhotoFile(null);
      fetchWorkerData();
    }
  };

  const handleToggleActive = async () => {
    if (!worker) return;
    const { error } = await supabase.from('workers').update({ is_active: !worker.is_active }).eq('id', worker.id);
    if (!error) {
      toast({ title: worker.is_active ? 'Worker deactivated' : 'Worker activated' });
      fetchWorkerData();
    }
  };

  const downloadQR = async () => {
    if (!worker) return;
    const scanUrl = `${window.location.origin}/scan?secret=${encodeURIComponent(worker.qr_secret)}`;
    const url = await QRCode.toDataURL(scanUrl, { width: 300 });
    const link = document.createElement('a');
    link.download = `${worker.name.replace(/\s+/g, '_')}_QR.png`;
    link.href = url;
    link.click();
  };

  const generateDailyQR = async (type?: 'check_in' | 'check_out') => {
    if (!worker) return;
    setGeneratingQR(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-daily-qr', {
        body: { worker_id: worker.id, type, force: true },
      });
      if (error) throw error;
      toast({ title: 'QR codes generated', description: worker.email ? 'Email sent to worker.' : 'No email configured.' });
      fetchWorkerData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to generate QR', variant: 'destructive' });
    }
    setGeneratingQR(false);
  };

  const getQRStatus = (type: 'check_in' | 'check_out') => {
    const qr = todayQRCodes.find(q => q.type === type);
    if (!qr) return { status: 'not_generated', label: 'Not Generated', color: 'text-muted-foreground' };
    if (qr.used_at) return { status: 'used', label: 'Used', color: 'text-status-in' };
    const now = new Date();
    if (now > new Date(qr.valid_until)) return { status: 'expired', label: 'Expired', color: 'text-status-late' };
    return { status: 'active', label: 'Active', color: 'text-brand-gold' };
  };

  // Check if a date is this worker's break day
  const isBreakDay = (date: Date): boolean => {
    if (worker?.break_day === null || worker?.break_day === undefined) return false;
    return date.getDay() === worker.break_day;
  };

  const hasPermissionOnDate = (dateStr: string): boolean => {
    return permissionDates.includes(dateStr);
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
        const onPermission = hasPermissionOnDate(dateStr);
        return [
          formatDate(d), 
          onPermission ? '-' : onBreak ? '-' : formatTime(att?.check_in), 
          onPermission ? '-' : onBreak ? '-' : formatTime(att?.check_out), 
          onPermission ? '-' : onBreak ? '-' : calculateHours(att?.check_in || null, att?.check_out || null),
          onPermission ? 'Permission' : onBreak ? 'Break' : (att?.is_late ? 'Late' : att?.check_in ? 'Present' : 'Absent')
        ];
      }),
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 4) {
          const cellText = String(data.cell.raw || '');
          if (cellText === 'Absent') {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
          } else if (cellText === 'Permission') {
            data.cell.styles.textColor = [37, 99, 235];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });
    doc.save(`${worker.name}_weekly_report.pdf`);
  };

  const addNote = async () => {
    if (!newNote.trim() || !worker || !user) return;
    setSavingNote(true);

    const { error } = await supabase.from('worker_notes').insert({
      worker_id: worker.id,
      author_id: user.id,
      content: newNote.trim(),
    });

    if (error) {
      toast({ title: 'Error', description: 'Failed to add note.', variant: 'destructive' });
    } else {
      setNewNote('');
      fetchWorkerData();
    }
    setSavingNote(false);
  };

  const deleteNote = async (noteId: string) => {
    const { error } = await supabase.from('worker_notes').delete().eq('id', noteId);
    if (!error) fetchWorkerData();
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-brand-gold" />
      </div>
    );
  }

  if (!worker) return null;

  const weekDates = getWeekDates(new Date());
  const age = calculateAge(worker.birthdate);
  const contractStatus = getContractStatus(worker.contract_end_date);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Link to="/workers" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Workers
          </Link>

          {/* Profile Header */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row items-start gap-4">
                <div className="relative">
                  <SecureAvatarWithPreview
                    avatarUrl={worker.avatar_url}
                    localPreview={photoPreview}
                    fallbackText={worker.name}
                    alt={worker.name}
                    className="w-24 h-24"
                  />
                  {editing && (
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      className="absolute -bottom-2 -right-2 w-8 h-8"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="w-4 h-4" />
                    </Button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>

                <div className="flex-1">
                  {editing ? (
                    <div className="space-y-3">
                      <div><Label>Name</Label><Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} /></div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Role</Label>
                          <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v as WorkerRole })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="barber">Barber</SelectItem>
                              <SelectItem value="cleaner">Cleaner</SelectItem>
                              <SelectItem value="receptionist">Receptionist</SelectItem>
                              <SelectItem value="manager">Manager</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div><Label>Birthdate</Label><Input type="date" value={formData.birthdate} onChange={(e) => setFormData({ ...formData, birthdate: e.target.value })} /></div>
                      </div>
                      <div><Label>Description</Label><Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Role description or notes" /></div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-2xl font-display font-bold">{worker.name}</h1>
                        <Badge variant={worker.is_active ? 'default' : 'secondary'}>{worker.is_active ? 'Active' : 'Inactive'}</Badge>
                      </div>
                      <p className="text-muted-foreground capitalize mb-1">{worker.role}</p>
                      {age && <p className="text-sm text-muted-foreground">{age} years old</p>}
                      {worker.description && <p className="text-sm mt-2">{worker.description}</p>}
                    </>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {editing ? (
                    <>
                      <Button onClick={handleSave} disabled={uploading} className="gradient-gold text-brand-black">
                        {uploading && <Loader2 className="w-4 h-4 animate-spin mr-1" />}Save
                      </Button>
                      <Button variant="outline" onClick={() => { setEditing(false); setPhotoFile(null); setPhotoPreview(worker.avatar_url); }}>Cancel</Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Edit2 className="w-4 h-4 mr-1" />Edit</Button>
                      <Button variant="outline" size="sm" onClick={handleToggleActive}><Power className="w-4 h-4 mr-1" />{worker.is_active ? 'Deactivate' : 'Activate'}</Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Employment Info */}
          <Card className="mb-6">
            <CardHeader><CardTitle className="flex items-center gap-2"><Briefcase className="w-5 h-5" />Employment</CardTitle></CardHeader>
            <CardContent>
              {editing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Employment Type</Label>
                    <Select value={formData.employment_type} onValueChange={(v) => setFormData({ ...formData, employment_type: v as EmploymentType })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full_time">Full-time Onsite</SelectItem>
                        <SelectItem value="contract">Contract</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Hire Date</Label><Input type="date" value={formData.hire_date} onChange={(e) => setFormData({ ...formData, hire_date: e.target.value })} /></div>
                  {formData.employment_type === 'contract' && (
                    <div><Label>Contract End Date</Label><Input type="date" value={formData.contract_end_date} onChange={(e) => setFormData({ ...formData, contract_end_date: e.target.value })} /></div>
                  )}
                  {formData.employment_type === 'full_time' && (
                    <div><Label>Monthly Salary</Label><Input value={formData.salary} onChange={(e) => setFormData({ ...formData, salary: e.target.value })} placeholder="e.g., 15,000 ETB" /></div>
                  )}
                  <div><Label>Start Time</Label><Input type="time" value={formData.custom_start_time} onChange={(e) => setFormData({ ...formData, custom_start_time: e.target.value })} /></div>
                  <div><Label>End Time</Label><Input type="time" value={formData.custom_end_time} onChange={(e) => setFormData({ ...formData, custom_end_time: e.target.value })} /></div>
                  <div>
                    <Label>Weekly Break Day</Label>
                    <Select 
                      value={formData.break_day || 'none'} 
                      onValueChange={(v) => setFormData({ ...formData, break_day: v === 'none' ? '' : v })}
                    >
                      <SelectTrigger><SelectValue placeholder="No break day" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No break day</SelectItem>
                        {DAY_NAMES.map((day, idx) => (
                          <SelectItem key={idx} value={String(idx)}>{day}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2"><Label>Email (for QR delivery)</Label><Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="worker@example.com" /></div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Type</p>
                    <p className="font-medium capitalize">{worker.employment_type?.replace('_', '-') || 'Full-time'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Hire Date</p>
                    <p className="font-medium">{worker.hire_date ? formatFullDate(worker.hire_date) : formatFullDate(worker.created_at)}</p>
                  </div>
                  {worker.employment_type === 'contract' && worker.contract_end_date && (
                    <>
                      <div>
                        <p className="text-muted-foreground">Contract Ends</p>
                        <p className="font-medium">{formatFullDate(worker.contract_end_date)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Status</p>
                        <Badge variant={contractStatus === 'active' ? 'default' : contractStatus === 'expiring' ? 'secondary' : 'destructive'}>
                          {contractStatus === 'expiring' ? 'Expiring Soon' : contractStatus === 'expired' ? 'Expired' : 'Active'}
                        </Badge>
                      </div>
                    </>
                  )}
                  {worker.employment_type !== 'contract' && worker.salary && (
                    <div>
                      <p className="text-muted-foreground">Monthly Salary</p>
                      <p className="font-medium">{worker.salary}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-muted-foreground">Weekly Break</p>
                    <p className="font-medium">{worker.break_day !== null && worker.break_day !== undefined ? DAY_NAMES[worker.break_day] : 'No break day'}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Weekly Attendance */}
          <Card className="mb-6">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5" />This Week</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={downloadQR}><Download className="w-4 h-4 mr-1" />QR Code</Button>
                <Button variant="outline" size="sm" onClick={exportPDF}><FileText className="w-4 h-4 mr-1" />Export PDF</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {weekDates.map((d) => {
                  const dateStr = formatToYYYYMMDD(d);
                  const att = weeklyAttendance.find((a) => a.date === dateStr);
                  const onBreak = isBreakDay(d);
                  const onPermission = hasPermissionOnDate(dateStr);
                  
                  const getStatusBadge = () => {
                    if (onPermission) return <Badge className="ml-3 w-20 justify-center bg-[hsl(var(--status-permission)/0.15)] text-status-permission border-0">Permission</Badge>;
                    if (onBreak) return <Badge variant="secondary" className="ml-3 w-20 justify-center">Break</Badge>;
                    if (att?.is_late) return <Badge variant="destructive" className="ml-3 w-20 justify-center">Late</Badge>;
                    if (att?.check_in) return <Badge variant="default" className="ml-3 w-20 justify-center">Present</Badge>;
                    return <Badge className="ml-3 w-20 justify-center bg-[hsl(var(--status-absent)/0.15)] text-status-absent border-0">Absent</Badge>;
                  };

                  return (
                    <div key={dateStr} className="flex items-center justify-between text-sm py-2 border-b border-border/50 last:border-0">
                      <span className="font-medium w-28">{formatDate(d)}</span>
                      <span className="flex-1 text-center">
                        {onPermission || onBreak ? '— — —' : `${formatTime(att?.check_in)} — ${formatTime(att?.check_out)}`}
                      </span>
                      <span className={`w-16 text-right ${att?.is_late ? 'text-status-late' : 'text-muted-foreground'}`}>
                        {onPermission || onBreak ? '—' : calculateHours(att?.check_in || null, att?.check_out || null)}
                      </span>
                      {getStatusBadge()}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Incidents */}
          {incidents.length > 0 && (
            <Card className="mb-6">
              <CardHeader><CardTitle className="flex items-center gap-2 text-status-late"><AlertTriangle className="w-5 h-5" />Incidents</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {incidents.map((inc) => (
                    <div key={inc.id} className="flex items-start gap-3 text-sm py-2 border-b border-border/50 last:border-0">
                      <AlertTriangle className="w-4 h-4 text-status-late mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium">{inc.incident_type}</p>
                        {inc.description && <p className="text-muted-foreground">{inc.description}</p>}
                      </div>
                      <span className="text-muted-foreground text-xs">{formatFullDate(inc.occurred_at)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="w-5 h-5" />Notes & Reminders</CardTitle></CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input 
                  placeholder="Add a note or reminder..." 
                  value={newNote} 
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && addNote()}
                />
                <Button onClick={addNote} disabled={savingNote || !newNote.trim()}>
                  {savingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </Button>
              </div>
              {notes.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">No notes yet.</p>
              ) : (
                <div className="space-y-2">
                  {notes.map((note) => (
                    <div key={note.id} className="flex items-start gap-3 text-sm py-2 border-b border-border/50 last:border-0 group">
                      <div className="flex-1">
                        <p>{note.content}</p>
                        <p className="text-muted-foreground text-xs mt-1">{formatFullDate(note.created_at)}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => deleteNote(note.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}
