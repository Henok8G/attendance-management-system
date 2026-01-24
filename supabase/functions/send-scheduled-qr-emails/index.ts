import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIMEZONE = "Africa/Addis_Ababa";

interface SMTPConfig {
  hostname: string;
  port: number;
  username: string;
  password: string;
  from: string;
}

interface Worker {
  id: string;
  name: string;
  email: string | null;
  owner_id: string;
  custom_start_time: string | null;
  custom_end_time: string | null;
}

interface Settings {
  owner_id: string;
  default_start_time: string;
  default_end_time: string;
}

// Get current date in Ethiopia timezone (YYYY-MM-DD)
function getEthiopiaDate(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

// Get current time in Ethiopia as hours and minutes
function getEthiopiaTime(): { hours: number; minutes: number } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  
  const parts = formatter.formatToParts(now);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || "0";
  
  return {
    hours: parseInt(getPart("hour")),
    minutes: parseInt(getPart("minute")),
  };
}

// Parse time string (HH:MM) to total minutes
function parseTimeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

// Generate cryptographically random token
function generateSecureToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Create timestamp for a specific time on a specific date in Ethiopia timezone
function createEthiopiaTimestamp(dateStr: string, timeStr: string): Date {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const [year, month, day] = dateStr.split("-").map(Number);
  
  // Create date in Ethiopia timezone (-3 for Africa/Addis_Ababa offset from UTC)
  const date = new Date(Date.UTC(year, month - 1, day, (hours || 0) - 3, minutes || 0));
  return date;
}

// Generate QR code image URL - encodes only the raw token
function generateQRCodeImageUrl(qrToken: string): string {
  const encodedToken = encodeURIComponent(qrToken);
  return `https://quickchart.io/qr?text=${encodedToken}&size=200&margin=1`;
}

// Format time for display
function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return formatter.format(date);
  } catch {
    return "N/A";
  }
}

// Build email HTML content
function buildEmailHTML(
  workerName: string,
  typeLabel: string,
  genType: string,
  date: string,
  validFromTime: string,
  validUntilTime: string,
  qrImageUrl: string
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
        
        <!-- Header -->
        <div style="background: linear-gradient(90deg, #c4a747 0%, #d4b957 100%); padding: 30px; text-align: center;">
          <h1 style="color: #1a1a1a; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 1px;">C-MAC BARBERSHOP</h1>
          <p style="color: #333; margin: 5px 0 0 0; font-size: 14px; text-transform: uppercase; letter-spacing: 2px;">Attendance System</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 40px 30px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <span style="display: inline-block; background: ${genType === 'check_in' ? '#22c55e' : '#3b82f6'}; color: white; padding: 8px 20px; border-radius: 20px; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
              ${typeLabel}
            </span>
          </div>
          
          <p style="color: #e0e0e0; font-size: 18px; margin: 0 0 10px 0;">Hello <strong style="color: #c4a747;">${workerName}</strong>,</p>
          <p style="color: #b0b0b0; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
            Here is your ${typeLabel.toLowerCase()} QR code for <strong style="color: #fff;">${date}</strong>. 
            <strong style="color: #c4a747;">Present this QR code to the scanner at the barbershop</strong> when you ${genType === 'check_in' ? 'arrive' : 'leave'}.
          </p>
          
          <!-- QR Code -->
          <div style="background: white; padding: 25px; border-radius: 12px; text-align: center; margin: 30px 0;">
            <img src="${qrImageUrl}" 
                 alt="QR Code for ${typeLabel}" 
                 width="200" 
                 height="200"
                 style="display: block; margin: 0 auto; border-radius: 8px;" />
            <p style="color: #666; font-size: 12px; margin: 15px 0 0 0;">
              <strong>Present this QR code to the designated scanner</strong>
            </p>
          </div>
          
          <!-- Instructions -->
          <div style="background: rgba(196, 167, 71, 0.1); border: 2px solid rgba(196, 167, 71, 0.3); padding: 20px; border-radius: 10px; margin: 30px 0; text-align: center;">
            <p style="color: #c4a747; font-size: 16px; margin: 0; font-weight: 600;">
              📍 How to use this QR code
            </p>
            <p style="color: #e0e0e0; font-size: 14px; margin: 10px 0 0 0; line-height: 1.6;">
              Show this QR code to the scanner at the barbershop entrance. The scanner operator will scan it to record your ${genType === 'check_in' ? 'arrival' : 'departure'}.
            </p>
          </div>
          
          <!-- Time Info -->
          <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 20px; border-radius: 10px; margin: 30px 0;">
            <p style="color: #c4a747; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 10px 0;">⏰ Valid Time Window</p>
            <p style="color: #fff; font-size: 18px; margin: 0; font-weight: 600;">
              ${validFromTime} — ${validUntilTime}
            </p>
            <p style="color: #888; font-size: 12px; margin: 10px 0 0 0;">Africa/Addis Ababa Timezone</p>
          </div>
          
          <!-- Security Notice -->
          <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 20px; margin-top: 30px;">
            <p style="color: #888; font-size: 12px; line-height: 1.6; margin: 0;">
              🔒 <strong>Security Notice:</strong> This QR code is unique to you and can only be used once. 
              Do not share it with anyone. If you suspect misuse, please contact your manager immediately.
            </p>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background: rgba(0,0,0,0.3); padding: 20px; text-align: center;">
          <p style="color: #666; font-size: 12px; margin: 0;">
            © ${new Date().getFullYear()} C-Mac Barbershop. All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Parse and format the from address properly
function formatFromAddress(fromStr: string): string {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailRegex.test(fromStr.trim())) {
    return fromStr.trim();
  }
  
  const namedEmailRegex = /^(.+?)\s*<([^\s@]+@[^\s@]+\.[^\s@]+)>$/;
  const namedMatch = fromStr.match(namedEmailRegex);
  if (namedMatch) {
    return fromStr.trim();
  }
  
  const extractEmailRegex = /([^\s@]+@[^\s@]+\.[^\s@]+)/;
  const emailMatch = fromStr.match(extractEmailRegex);
  if (emailMatch) {
    const email = emailMatch[1];
    const name = fromStr.replace(email, '').trim();
    if (name) {
      return `"${name}" <${email}>`;
    }
    return email;
  }
  
  return fromStr;
}

// Send email using SMTP
async function sendEmailViaSMTP(
  smtpConfig: SMTPConfig,
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; error?: string }> {
  let client: SMTPClient | null = null;
  
  try {
    console.log(`📧 Sending email to ${to}...`);
    
    const useDirectTls = smtpConfig.port === 465;
    
    client = new SMTPClient({
      connection: {
        hostname: smtpConfig.hostname,
        port: smtpConfig.port,
        tls: useDirectTls,
        auth: {
          username: smtpConfig.username,
          password: smtpConfig.password,
        },
      },
    });

    const formattedFrom = formatFromAddress(smtpConfig.from);
    
    await client.send({
      from: formattedFrom,
      to: to,
      subject: subject,
      content: "Please view this email in an HTML-compatible email client.",
      html: html,
    });

    console.log(`✅ Email sent to ${to}`);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown SMTP error";
    console.error(`❌ SMTP error sending to ${to}:`, errorMessage);
    return { success: false, error: errorMessage };
  } finally {
    if (client) {
      try {
        await client.close();
      } catch (closeError) {
        console.warn("Warning: Failed to close SMTP connection:", closeError);
      }
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("🕐 Starting scheduled QR email check...");
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Get SMTP configuration
    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = Deno.env.get("SMTP_PORT");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");
    const smtpFrom = Deno.env.get("SMTP_FROM");

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !smtpFrom) {
      console.error("SMTP not configured");
      return new Response(
        JSON.stringify({ error: "SMTP not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const smtpConfig: SMTPConfig = {
      hostname: smtpHost,
      port: parseInt(smtpPort, 10),
      username: smtpUser,
      password: smtpPass,
      from: smtpFrom,
    };

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get current Ethiopia time
    const todayDate = getEthiopiaDate();
    const { hours: currentHour, minutes: currentMinute } = getEthiopiaTime();
    const currentTotalMinutes = currentHour * 60 + currentMinute;
    
    // Get day of week (0=Sunday, 1=Monday, ..., 5=Friday, 6=Saturday)
    const now = new Date();
    const dayFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: TIMEZONE,
      weekday: "short",
    });
    const dayStr = dayFormatter.format(now);
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dayOfWeek = dayMap[dayStr] ?? 0;

    console.log(`📅 Today: ${todayDate}, Day: ${dayOfWeek}, Current time: ${currentHour}:${String(currentMinute).padStart(2, '0')} (${currentTotalMinutes} mins)`);

    // Get all owner settings for default times
    const { data: allSettings, error: settingsError } = await supabase
      .from("settings")
      .select("owner_id, default_start_time, default_end_time");

    if (settingsError) {
      console.error("Error fetching settings:", settingsError);
      throw new Error("Failed to fetch settings");
    }

    // Create a map of owner_id to their settings
    const settingsMap = new Map<string, Settings>();
    for (const s of (allSettings || [])) {
      settingsMap.set(s.owner_id, s as Settings);
    }

    // Get all day-specific schedules for today's day of week
    const { data: daySchedules } = await supabase
      .from("day_schedules")
      .select("owner_id, start_time, end_time, is_enabled")
      .eq("day_of_week", dayOfWeek)
      .eq("is_enabled", true);

    // Create a map of owner_id to their day-specific schedule
    const dayScheduleMap = new Map<string, { start_time: string; end_time: string }>();
    for (const ds of (daySchedules || [])) {
      dayScheduleMap.set(ds.owner_id, { start_time: ds.start_time, end_time: ds.end_time });
    }

    // Get all active workers with email
    const { data: workers, error: workersError } = await supabase
      .from("workers")
      .select("id, name, email, owner_id, custom_start_time, custom_end_time")
      .eq("is_active", true)
      .not("email", "is", null);

    if (workersError) {
      console.error("Error fetching workers:", workersError);
      throw new Error("Failed to fetch workers");
    }

    if (!workers || workers.length === 0) {
      console.log("No active workers with email found");
      return new Response(
        JSON.stringify({ message: "No active workers with email", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${workers.length} active workers with email`);

    // Time window tolerance: emails are sent within ±2 minutes of the scheduled time
    const TOLERANCE_MINUTES = 2;

    const results: Array<{
      worker_id: string;
      worker_name: string;
      type: string;
      status: string;
      error?: string;
    }> = [];

    for (const worker of workers as Worker[]) {
      const ownerSettings = settingsMap.get(worker.owner_id);
      const daySchedule = dayScheduleMap.get(worker.owner_id);
      
      // Priority: Day-specific schedule OVERRIDES everything (including worker custom times)
      // If there's a day schedule, ALL workers use it; otherwise fall back to worker custom or defaults
      const defaultStartTime = ownerSettings?.default_start_time || "09:00";
      const defaultEndTime = ownerSettings?.default_end_time || "18:00";

      const workerStartTime = daySchedule ? daySchedule.start_time : (worker.custom_start_time || defaultStartTime);
      const workerEndTime = daySchedule ? daySchedule.end_time : (worker.custom_end_time || defaultEndTime);

      const startMinutes = parseTimeToMinutes(workerStartTime);
      const endMinutes = parseTimeToMinutes(workerEndTime);

      // Check if current time matches start time (for check-in email)
      const isStartTime = Math.abs(currentTotalMinutes - startMinutes) <= TOLERANCE_MINUTES;
      
      // Check if current time matches end time (for check-out email)
      const isEndTime = Math.abs(currentTotalMinutes - endMinutes) <= TOLERANCE_MINUTES;

      if (!isStartTime && !isEndTime) {
        continue; // Skip workers whose time doesn't match
      }

      const qrType = isStartTime ? "check_in" : "check_out";
      const typeLabel = isStartTime ? "Check-In" : "Check-Out";
      const scheduledTime = isStartTime ? workerStartTime : workerEndTime;

      console.log(`⏰ ${worker.name}: Time to send ${qrType} email (scheduled: ${scheduledTime})`);

      // Check if QR already exists for today and this type
      const { data: existingQR } = await supabase
        .from("daily_qr_codes")
        .select("id, qr_token")
        .eq("worker_id", worker.id)
        .eq("date", todayDate)
        .eq("type", qrType)
        .maybeSingle();

      let qrToken: string;
      let qrCodeId: string;

      if (existingQR) {
        // Check if email was already sent for this QR
        const { data: existingDelivery } = await supabase
          .from("qr_email_delivery")
          .select("id, status")
          .eq("qr_code_id", existingQR.id)
          .eq("status", "sent")
          .maybeSingle();

        if (existingDelivery) {
          console.log(`📧 Email already sent for ${worker.name} ${qrType}, skipping...`);
          continue;
        }

        qrToken = existingQR.qr_token;
        qrCodeId = existingQR.id;
        console.log(`📋 Using existing QR for ${worker.name} ${qrType}`);
      } else {
        // Generate new QR code
        qrToken = generateSecureToken();

        // Calculate validity window: 30 min before to 2 hours after scheduled time
        const validFromTime = `${String(Math.floor((startMinutes - 30) / 60)).padStart(2, '0')}:${String((startMinutes - 30) % 60).padStart(2, '0')}`;
        
        let validFrom: Date;
        let validUntil: Date;

        if (qrType === "check_in") {
          validFrom = createEthiopiaTimestamp(todayDate, `${String(Math.max(0, Math.floor((startMinutes - 30) / 60))).padStart(2, '0')}:${String(Math.max(0, (startMinutes - 30) % 60)).padStart(2, '0')}`);
          validUntil = createEthiopiaTimestamp(todayDate, `${String(Math.floor((startMinutes + 120) / 60)).padStart(2, '0')}:${String((startMinutes + 120) % 60).padStart(2, '0')}`);
        } else {
          validFrom = createEthiopiaTimestamp(todayDate, `${String(Math.max(0, Math.floor((endMinutes - 120) / 60))).padStart(2, '0')}:${String(Math.max(0, (endMinutes - 120) % 60)).padStart(2, '0')}`);
          validUntil = createEthiopiaTimestamp(todayDate, `${String(Math.min(23, Math.floor((endMinutes + 120) / 60))).padStart(2, '0')}:${String((endMinutes + 120) % 60).padStart(2, '0')}`);
        }

        const { data: newQR, error: insertError } = await supabase
          .from("daily_qr_codes")
          .insert({
            worker_id: worker.id,
            owner_id: worker.owner_id,
            date: todayDate,
            qr_token: qrToken,
            type: qrType,
            valid_from: validFrom.toISOString(),
            valid_until: validUntil.toISOString(),
          })
          .select("id")
          .single();

        if (insertError) {
          console.error(`Error creating QR for ${worker.name}:`, insertError);
          results.push({
            worker_id: worker.id,
            worker_name: worker.name,
            type: qrType,
            status: "failed",
            error: "Failed to create QR code",
          });
          continue;
        }

        qrCodeId = newQR.id;
        console.log(`✅ Created new QR for ${worker.name} ${qrType}`);
      }

      // Get QR code details for email
      const { data: qrDetails } = await supabase
        .from("daily_qr_codes")
        .select("valid_from, valid_until")
        .eq("id", qrCodeId)
        .single();

      // Build and send email
      const qrImageUrl = generateQRCodeImageUrl(qrToken);
      const validFromFormatted = qrDetails ? formatTime(qrDetails.valid_from) : "N/A";
      const validUntilFormatted = qrDetails ? formatTime(qrDetails.valid_until) : "N/A";

      const html = buildEmailHTML(
        worker.name,
        typeLabel,
        qrType,
        todayDate,
        validFromFormatted,
        validUntilFormatted,
        qrImageUrl
      );

      const subject = `Your ${typeLabel} QR Code for ${todayDate}`;
      const emailResult = await sendEmailViaSMTP(smtpConfig, worker.email!, subject, html);

      // Record delivery status
      await supabase.from("qr_email_delivery").upsert({
        qr_code_id: qrCodeId,
        worker_id: worker.id,
        qr_token: qrToken,
        email_address: worker.email!,
        status: emailResult.success ? "sent" : "failed",
        email_sent_at: emailResult.success ? new Date().toISOString() : null,
        error_message: emailResult.error || null,
        owner_id: worker.owner_id,
      }, { onConflict: "qr_code_id" });

      results.push({
        worker_id: worker.id,
        worker_name: worker.name,
        type: qrType,
        status: emailResult.success ? "sent" : "failed",
        error: emailResult.error,
      });
    }

    const sentCount = results.filter(r => r.status === "sent").length;
    const failedCount = results.filter(r => r.status === "failed").length;

    console.log(`📊 Scheduled email check complete: ${sentCount} sent, ${failedCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        date: todayDate,
        time: `${currentHour}:${String(currentMinute).padStart(2, '0')}`,
        processed: results.length,
        sent: sentCount,
        failed: failedCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Scheduled email check failed:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
