// Africa/Addis_Ababa timezone utilities using date-fns-tz
import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';
import { addDays as dateFnsAddDays, startOfDay as dateFnsStartOfDay, differenceInYears, parseISO } from 'date-fns';

const TIMEZONE = 'Africa/Addis_Ababa';

/**
 * Convert a UTC date to Africa/Addis_Ababa timezone
 */
export function toLocalTime(utcDate: string | Date): Date {
  const date = typeof utcDate === 'string' ? new Date(utcDate) : utcDate;
  return toZonedTime(date, TIMEZONE);
}

/**
 * Convert a local (Africa/Addis_Ababa) date to UTC
 */
export function toUTC(localDate: Date): Date {
  return fromZonedTime(localDate, TIMEZONE);
}

/**
 * Format time in Africa/Addis_Ababa timezone
 */
export function formatTime(date: string | Date | null): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return formatInTimeZone(d, TIMEZONE, 'hh:mm a');
}

/**
 * Format date in Africa/Addis_Ababa timezone (short format)
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return formatInTimeZone(d, TIMEZONE, 'EEE, MMM d');
}

/**
 * Format date in Africa/Addis_Ababa timezone (full format)
 */
export function formatFullDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return formatInTimeZone(d, TIMEZONE, 'EEEE, MMMM d, yyyy');
}

/**
 * Calculate hours worked between check-in and check-out
 */
export function calculateHours(checkIn: string | null, checkOut: string | null): string {
  if (!checkIn || !checkOut) return '—';
  
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  const diffMs = end.getTime() - start.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  return `${diffHours}:${diffMinutes.toString().padStart(2, '0')}`;
}

/**
 * Get week dates starting from Monday, using Africa/Addis_Ababa timezone
 */
export function getWeekDates(date: Date): Date[] {
  const week: Date[] = [];
  const zonedDate = toZonedTime(date, TIMEZONE);
  const day = zonedDate.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  
  const monday = dateFnsAddDays(zonedDate, diff);
  const startOfMonday = dateFnsStartOfDay(monday);
  
  for (let i = 0; i < 7; i++) {
    week.push(dateFnsAddDays(startOfMonday, i));
  }
  
  return week;
}

/**
 * Get today's date in YYYY-MM-DD format using Africa/Addis_Ababa timezone
 * This is the critical fix for the off-by-one date bug
 */
export function getToday(): string {
  return formatInTimeZone(new Date(), TIMEZONE, 'yyyy-MM-dd');
}

/**
 * Check if a date string matches today in Africa/Addis_Ababa timezone
 */
export function isToday(date: string): boolean {
  return date === getToday();
}

/**
 * Convert a Date to YYYY-MM-DD string in Africa/Addis_Ababa timezone
 * Use this when selecting dates from the datepicker
 */
export function formatToYYYYMMDD(date: Date): string {
  return formatInTimeZone(date, TIMEZONE, 'yyyy-MM-dd');
}

/**
 * Get start of day in Africa/Addis_Ababa timezone
 */
export function startOfDay(date: Date): Date {
  const zonedDate = toZonedTime(date, TIMEZONE);
  return dateFnsStartOfDay(zonedDate);
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
  return dateFnsAddDays(date, days);
}

/**
 * Parse a YYYY-MM-DD string to a Date object, treating it as Africa/Addis_Ababa date
 */
export function parseYYYYMMDD(dateStr: string): Date {
  // Parse as Africa/Addis_Ababa midnight
  return toZonedTime(new Date(dateStr + 'T00:00:00'), TIMEZONE);
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
  
  // Convert check-in to Africa/Addis_Ababa time
  const checkIn = toLocalTime(checkInTime);
  const checkInMinutes = checkIn.getHours() * 60 + checkIn.getMinutes();
  
  return checkInMinutes > lateThreshold;
}

/**
 * Calculate how many minutes late a worker checked in
 * Returns 0 if not late or no check-in
 */
export function calculateLateMinutes(
  checkInTime: string | null,
  defaultStartTime: string,
  lateThresholdMinutes: number,
  customStartTime?: string | null
): number {
  if (!checkInTime) return 0;
  
  const startTime = customStartTime || defaultStartTime;
  const startMinutes = parseTimeToMinutes(startTime);
  const lateThreshold = startMinutes + lateThresholdMinutes;
  
  // Convert check-in to Africa/Addis_Ababa time
  const checkIn = toLocalTime(checkInTime);
  const checkInMinutes = checkIn.getHours() * 60 + checkIn.getMinutes();
  
  if (checkInMinutes > lateThreshold) {
    return checkInMinutes - lateThreshold;
  }
  
  return 0;
}

/**
 * Format late minutes to a readable string (e.g., "15m" or "1h 30m")
 */
export function formatLateTime(minutes: number): string {
  if (minutes <= 0) return '—';
  
  if (minutes < 60) {
    return `${minutes}m`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (remainingMinutes === 0) {
    return `${hours}h`;
  }
  
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Calculate age from birthdate
 */
export function calculateAge(birthdate: string | Date | null): number | null {
  if (!birthdate) return null;
  const birth = typeof birthdate === 'string' ? parseISO(birthdate) : birthdate;
  return differenceInYears(new Date(), birth);
}

/**
 * Format a date for display with relative info (e.g., contract duration)
 */
export function formatContractDuration(startDate: string | Date | null, endDate: string | Date | null): string {
  if (!startDate || !endDate) return '—';
  const start = typeof startDate === 'string' ? parseISO(startDate) : startDate;
  const end = typeof endDate === 'string' ? parseISO(endDate) : endDate;
  const months = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30));
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''}`;
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (remainingMonths === 0) return `${years} year${years !== 1 ? 's' : ''}`;
  return `${years} year${years !== 1 ? 's' : ''}, ${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`;
}

/**
 * Get contract status
 */
export function getContractStatus(endDate: string | Date | null): 'active' | 'expiring' | 'expired' | null {
  if (!endDate) return null;
  const end = typeof endDate === 'string' ? parseISO(endDate) : endDate;
  const now = new Date();
  const daysUntilEnd = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysUntilEnd < 0) return 'expired';
  if (daysUntilEnd <= 30) return 'expiring';
  return 'active';
}
