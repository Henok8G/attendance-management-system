export type WorkerRole = 'barber' | 'cleaner' | 'receptionist' | 'manager';
export type AttendanceStatus = 'in' | 'out' | 'late' | 'absent';
export type EmploymentType = 'contract' | 'full_time';

export interface Worker {
  id: string;
  name: string;
  role: WorkerRole;
  avatar_url: string | null;
  qr_secret: string;
  salary: string | null;
  is_active: boolean;
  custom_start_time: string | null;
  custom_end_time: string | null;
  created_at: string;
  updated_at: string;
  // Extended fields
  birthdate: string | null;
  description: string | null;
  employment_type: EmploymentType | null;
  contract_end_date: string | null;
  hire_date: string | null;
}

export interface Attendance {
  id: string;
  worker_id: string;
  scanner_id: string | null;
  check_in: string | null;
  check_out: string | null;
  status: AttendanceStatus;
  date: string;
  is_late: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  workers?: Worker;
}

export interface Scanner {
  id: string;
  name: string;
  location: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Incident {
  id: string;
  worker_id: string | null;
  scanner_id: string | null;
  incident_type: string;
  description: string | null;
  occurred_at: string;
  resolved: boolean;
  created_at: string;
  workers?: Worker;
}

export interface Settings {
  id: string;
  owner_id: string;
  default_start_time: string;
  default_end_time: string;
  late_threshold_minutes: number;
  auto_refresh_interval: number;
  realtime_enabled: boolean;
  show_incidents: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkerNote {
  id: string;
  worker_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface AttendanceWithWorker extends Attendance {
  workers: Worker;
}

export interface DailySummary {
  totalWorkers: number;
  checkedIn: number;
  checkedOut: number;
  absent: number;
  late: number;
  incidents: number;
}
