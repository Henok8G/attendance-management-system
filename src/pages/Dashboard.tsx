import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { supabase } from '@/integrations/supabase/client';
import { AttendanceWithWorker, DailySummary, Incident, Worker } from '@/lib/types';
import { getToday } from '@/lib/timezone';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { SummaryCards } from '@/components/dashboard/SummaryCards';
import { AttendanceTable } from '@/components/dashboard/AttendanceTable';
import { FilterBar } from '@/components/dashboard/FilterBar';
import { WorkerModal } from '@/components/dashboard/WorkerModal';
import { WeeklyHistoryModal } from '@/components/dashboard/WeeklyHistoryModal';
import { Loader2 } from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { settings } = useSettings();

  const [attendance, setAttendance] = useState<AttendanceWithWorker[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [permissionWorkerIds, setPermissionWorkerIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>('daily');
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [showIncidentsOnly, setShowIncidentsOnly] = useState(false);
  const [showWeeklyHistory, setShowWeeklyHistory] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;

    setLoading(true);

    // Fetch workers
    const { data: workersData } = await supabase
      .from('workers')
      .select('*')
      .eq('is_active', true)
      .order('name');

    // Fetch attendance for selected date with worker info
    const { data: attendanceData } = await supabase
      .from('attendance')
      .select('*, workers(*)')
      .eq('date', selectedDate);

    // Fetch today's incidents
    const today = getToday();
    const { data: incidentsData } = await supabase
      .from('incidents')
      .select('*, workers(*)')
      .gte('occurred_at', `${today}T00:00:00`)
      .order('occurred_at', { ascending: false });

    // Fetch permission requests for selected date
    const { data: permData } = await supabase
      .from('permission_requests')
      .select('staff_id')
      .eq('request_date', selectedDate)
      .eq('status', 'approved');

    if (workersData) setWorkers(workersData as Worker[]);
    if (attendanceData) setAttendance(attendanceData as AttendanceWithWorker[]);
    if (incidentsData) setIncidents(incidentsData as Incident[]);
    setPermissionWorkerIds((permData || []).map((p: any) => p.staff_id));

    setLoading(false);
  }, [user, selectedDate]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
      return;
    }

    fetchData();
  }, [user, authLoading, navigate, fetchData]);

  // Auto-refresh based on settings
  useEffect(() => {
    if (!settings?.auto_refresh_interval) return;

    const interval = setInterval(() => {
      fetchData();
    }, settings.auto_refresh_interval * 60 * 1000);

    return () => clearInterval(interval);
  }, [settings?.auto_refresh_interval, fetchData]);

  // Refetch on page focus
  useEffect(() => {
    const handleFocus = () => fetchData();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchData]);

  // Realtime subscription
  useEffect(() => {
    if (!settings?.realtime_enabled) return;

    const channel = supabase
      .channel('attendance-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        () => fetchData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incidents' },
        () => fetchData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [settings?.realtime_enabled, fetchData]);

  // Calculate how many workers are on break today
  const selectedDateObj = new Date(selectedDate + 'T12:00:00');
  const dayOfWeek = selectedDateObj.getDay();
  const workersOnBreak = workers.filter(w => w.break_day === dayOfWeek).length;
  
  const workersOnPermission = permissionWorkerIds.filter(id => workers.some(w => w.id === id)).length;

  const summary: DailySummary = {
    totalWorkers: workers.length,
    checkedIn: attendance.filter((a) => a.check_in && !a.check_out).length,
    checkedOut: attendance.filter((a) => a.check_out).length,
    absent: workers.length - attendance.length - workersOnBreak - workersOnPermission,
    late: attendance.filter((a) => a.is_late).length,
    onBreak: workersOnBreak,
    onPermission: workersOnPermission,
  };

  // Filter workers first for search
  const filteredWorkers = workers.filter((w) =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter attendance based on filtered workers and incidents
  const filteredAttendance = attendance.filter((a) => {
    const matchesSearch = filteredWorkers.some((w) => w.id === a.worker_id);
    const matchesIncidents = !showIncidentsOnly || a.is_late || incidents.some((i) => i.worker_id === a.worker_id);
    return matchesSearch && matchesIncidents;
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-brand-gold" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      
      <main className="container mx-auto px-4 py-6 max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <SummaryCards summary={summary} loading={loading} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mt-6"
        >
          <FilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            showIncidentsOnly={showIncidentsOnly}
            onShowIncidentsOnlyChange={setShowIncidentsOnly}
            onOpenWeeklyHistory={() => setShowWeeklyHistory(true)}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mt-6"
        >
          <AttendanceTable
            attendance={filteredAttendance}
            workers={filteredWorkers}
            incidents={incidents}
            loading={loading}
            selectedDate={selectedDate}
            onWorkerClick={setSelectedWorker}
            onRefresh={fetchData}
            settings={settings}
          />
        </motion.div>
      </main>

      <WorkerModal
        worker={selectedWorker}
        open={!!selectedWorker}
        onClose={() => setSelectedWorker(null)}
        onUpdate={fetchData}
      />

      <WeeklyHistoryModal
        open={showWeeklyHistory}
        onClose={() => setShowWeeklyHistory(false)}
        workers={workers}
        settings={settings}
      />
    </div>
  );
}
