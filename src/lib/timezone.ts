// Africa/Addis_Ababa is UTC+3
const TIMEZONE_OFFSET = 3;

export function toLocalTime(utcDate: string | Date): Date {
  const date = new Date(utcDate);
  return new Date(date.getTime() + TIMEZONE_OFFSET * 60 * 60 * 1000);
}

export function formatTime(date: string | Date | null): string {
  if (!date) return '—';
  const localDate = toLocalTime(date);
  return localDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDate(date: string | Date): string {
  const localDate = toLocalTime(date);
  return localDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatFullDate(date: string | Date): string {
  const localDate = toLocalTime(date);
  return localDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function calculateHours(checkIn: string | null, checkOut: string | null): string {
  if (!checkIn || !checkOut) return '—';
  
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  const diffMs = end.getTime() - start.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  return `${diffHours}:${diffMinutes.toString().padStart(2, '0')}`;
}

export function getWeekDates(date: Date): Date[] {
  const week: Date[] = [];
  const current = new Date(date);
  const day = current.getDay();
  const diff = current.getDate() - day + (day === 0 ? -6 : 1);
  
  current.setDate(diff);
  
  for (let i = 0; i < 7; i++) {
    week.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  
  return week;
}

export function getToday(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

export function isToday(date: string): boolean {
  return date === getToday();
}

export function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function isLate(
  checkInTime: string | null,
  defaultStartTime: string,
  lateThresholdMinutes: number,
  customStartTime?: string | null
): boolean {
  if (!checkInTime) return false;
  
  const startTime = customStartTime || defaultStartTime;
  const startMinutes = parseTimeToMinutes(startTime);
  const lateThreshold = startMinutes + lateThresholdMinutes;
  
  const checkIn = new Date(checkInTime);
  const checkInMinutes = checkIn.getHours() * 60 + checkIn.getMinutes();
  
  return checkInMinutes > lateThreshold;
}
