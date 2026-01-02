import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIMEZONE = "Africa/Addis_Ababa";

// Input validation schema
const RequestSchema = z.object({
  worker_id: z.string().uuid().optional(),
  type: z.enum(["check_in", "check_out"]).optional(),
  force: z.boolean().optional().default(false),
});

interface SMTPConfig {
  hostname: string;
  port: number;
  username: string;
  password: string;
  from: string;
}

// Generate cryptographically random token
function generateSecureToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Get current date in Ethiopia timezone
function getEthiopiaDate(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

// Get current time in Ethiopia as Date object
function getEthiopiaDateTime(): Date {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  
  const parts = formatter.formatToParts(now);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || "0";
  
  return new Date(
    parseInt(getPart("year")),
    parseInt(getPart("month")) - 1,
    parseInt(getPart("day")),
    parseInt(getPart("hour")),
    parseInt(getPart("minute")),
    parseInt(getPart("second"))
  );
}

// Parse time string (HH:MM) to hours and minutes
function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return { hours: hours || 0, minutes: minutes || 0 };
}

// Create timestamp for a specific time on a specific date in Ethiopia timezone
function createEthiopiaTimestamp(dateStr: string, timeStr: string): Date {
  const { hours, minutes } = parseTime(timeStr);
  const [year, month, day] = dateStr.split("-").map(Number);
  
  // Create date in Ethiopia timezone
  const date = new Date(Date.UTC(year, month - 1, day, hours - 3, minutes)); // -3 for Africa/Addis_Ababa offset
  return date;
}

// Generate QR code image URL
function generateQRCodeImageUrl(scanUrl: string): string {
  const encodedUrl = encodeURIComponent(scanUrl);
  return `https://quickchart.io/qr?text=${encodedUrl}&size=200&margin=1`;
}

// Build email HTML content
function buildEmailHTML(
  workerName: string,
  typeLabel: string,
  genType: string,
  date: string,
  scanUrl: string,
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
            Please scan this code at the designated scanner when you ${genType === 'check_in' ? 'arrive' : 'leave'}.
          </p>
          
          <!-- QR Code -->
          <div style="background: white; padding: 25px; border-radius: 12px; text-align: center; margin: 30px 0;">
            <img src="${qrImageUrl}" 
                 alt="QR Code for ${typeLabel}" 
                 width="200" 
                 height="200"
                 style="display: block; margin: 0 auto; border-radius: 8px;" />
            <p style="color: #666; font-size: 12px; margin: 15px 0 0 0;">Scan with your phone camera or the barbershop scanner</p>
          </div>
          
          <!-- CTA Button -->
          <div style="text-align: center; margin: 30px 0;">
            <a href="${scanUrl}" 
               style="display: inline-block; background: linear-gradient(90deg, #c4a747 0%, #d4b957 100%); color: #1a1a1a; padding: 16px 40px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 16px; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 4px 15px rgba(196, 167, 71, 0.4);">
              ${genType === 'check_in' ? '🏁 Scan Check-In' : '🏠 Scan Check-Out'}
            </a>
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
  // If it's already a valid email format, return as-is
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailRegex.test(fromStr.trim())) {
    return fromStr.trim();
  }
  
  // Check if it's in "Name <email>" format
  const namedEmailRegex = /^(.+?)\s*<([^\s@]+@[^\s@]+\.[^\s@]+)>$/;
  const namedMatch = fromStr.match(namedEmailRegex);
  if (namedMatch) {
    return fromStr.trim();
  }
  
  // Try to extract email from "Name email@domain.com" format
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
  
  // Fallback: return as-is and let SMTP handle validation
  return fromStr;
}

// Send email using SMTP (Gmail compatible)
async function sendEmailViaSMTP(
  smtpConfig: SMTPConfig,
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; error?: string }> {
  let client: SMTPClient | null = null;
  
  try {
    console.log(`📧 Connecting to SMTP server ${smtpConfig.hostname}:${smtpConfig.port}...`);
    
    // For Gmail SMTP:
    // Port 587 uses STARTTLS (tls: false, then upgrade)
    // Port 465 uses direct TLS (tls: true)
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

    // Format the from address properly
    const formattedFrom = formatFromAddress(smtpConfig.from);
    console.log(`📧 Sending email to ${to} from ${formattedFrom}...`);
    
    await client.send({
      from: formattedFrom,
      to: to,
      subject: subject,
      content: "Please view this email in an HTML-compatible email client.",
      html: html,
    });

    console.log(`✅ Email successfully sent to ${to}`);
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Get SMTP configuration
    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = Deno.env.get("SMTP_PORT");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");
    const smtpFrom = Deno.env.get("SMTP_FROM");

    // Check if SMTP is configured
    const smtpConfigured = smtpHost && smtpPort && smtpUser && smtpPass && smtpFrom;
    
    let smtpConfig: SMTPConfig | null = null;
    if (smtpConfigured) {
      smtpConfig = {
        hostname: smtpHost,
        port: parseInt(smtpPort, 10),
        username: smtpUser,
        password: smtpPass,
        from: smtpFrom,
      };
      console.log(`📧 SMTP configured: ${smtpHost}:${smtpPort} from ${smtpFrom}`);
    } else {
      console.warn("⚠️ SMTP not fully configured - emails will not be sent");
    }

    // ========== AUTHENTICATION ==========
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("Missing Authorization header");
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify JWT using anon key client with user's token
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      console.error("Invalid or expired token:", authError?.message);
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Authenticated user: ${user.id}`);

    // Use service role client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ========== INPUT VALIDATION ==========
    let body: unknown;
    try {
      body = await req.json().catch(() => ({}));
    } catch {
      body = {};
    }

    const parseResult = RequestSchema.safeParse(body);
    if (!parseResult.success) {
      console.error("Input validation failed:", parseResult.error.errors);
      return new Response(
        JSON.stringify({ 
          error: "Invalid input", 
          details: parseResult.error.errors.map(e => e.message) 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { worker_id, type, force } = parseResult.data;

    // ========== OWNERSHIP VALIDATION ==========
    // Verify the user owns the workers they're trying to generate QR codes for
    if (worker_id) {
      const { data: worker, error: workerError } = await supabase
        .from("workers")
        .select("owner_id")
        .eq("id", worker_id)
        .maybeSingle();

      if (workerError || !worker) {
        console.error("Worker not found:", worker_id);
        return new Response(
          JSON.stringify({ error: "Worker not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (worker.owner_id !== user.id) {
        console.error(`User ${user.id} not authorized for worker ${worker_id}`);
        return new Response(
          JSON.stringify({ error: "Not authorized for this worker" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get today's date in Ethiopia
    const todayDate = getEthiopiaDate();
    const ethiopiaTime = getEthiopiaDateTime();
    const currentHour = ethiopiaTime.getHours();
    const currentMinute = ethiopiaTime.getMinutes();
    const currentMinutes = currentHour * 60 + currentMinute;

    console.log(`Current Ethiopia time: ${currentHour}:${currentMinute}, date: ${todayDate}`);

    // Get settings for default times
    const { data: settingsData } = await supabase
      .from("settings")
      .select("default_start_time, default_end_time")
      .eq("owner_id", user.id)
      .limit(1)
      .maybeSingle();

    const defaultStartTime = settingsData?.default_start_time || "08:00";
    const defaultEndTime = settingsData?.default_end_time || "17:00";

    // Build worker query - only get workers owned by this user
    let workersQuery = supabase
      .from("workers")
      .select("id, name, email, custom_start_time, custom_end_time, is_active")
      .eq("is_active", true)
      .eq("owner_id", user.id);

    if (worker_id) {
      workersQuery = workersQuery.eq("id", worker_id);
    }

    const { data: workers, error: workersError } = await workersQuery;

    if (workersError) {
      console.error("Error fetching workers:", workersError);
      throw new Error("Failed to fetch workers");
    }

    if (!workers || workers.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active workers found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    interface QRResult {
      worker_id: string;
      worker_name: string;
      type: string;
      status: string;
      qr_token?: string;
      qr_code_id?: string | null;
      valid_from?: string;
      valid_until?: string;
      email_sent?: boolean;
      email_error?: string | null;
    }
    const results: QRResult[] = [];
    const appUrl = Deno.env.get("APP_URL") || "https://qlobfbzhjtzzdjqxcrhu.lovable.app";

    for (const worker of workers) {
      const workerStartTime = worker.custom_start_time || defaultStartTime;
      const workerEndTime = worker.custom_end_time || defaultEndTime;

      const startTimeMinutes = parseTime(workerStartTime).hours * 60 + parseTime(workerStartTime).minutes;
      const endTimeMinutes = parseTime(workerEndTime).hours * 60 + parseTime(workerEndTime).minutes;

      // Determine which QR code to generate based on current time or forced type
      let qrType: "check_in" | "check_out" | null = null;

      if (type) {
        qrType = type;
      } else if (force) {
        qrType = null; // Will handle both below
      } else {
        // Auto-determine based on time
        if (currentMinutes >= startTimeMinutes - 30 && currentMinutes <= startTimeMinutes + 120) {
          qrType = "check_in";
        } else if (currentMinutes >= endTimeMinutes - 120 && currentMinutes <= endTimeMinutes + 120) {
          qrType = "check_out";
        }
      }

      const typesToGenerate = force && !type 
        ? ["check_in", "check_out"] as const
        : qrType 
          ? [qrType] 
          : [];

      for (const genType of typesToGenerate) {
        // Check if QR already exists for today
        const { data: existingQR } = await supabase
          .from("daily_qr_codes")
          .select("id, qr_token, used_at")
          .eq("worker_id", worker.id)
          .eq("date", todayDate)
          .eq("type", genType)
          .maybeSingle();

        if (existingQR && !force) {
          results.push({
            worker_id: worker.id,
            worker_name: worker.name,
            type: genType,
            status: existingQR.used_at ? "already_used" : "already_exists",
            qr_token: existingQR.qr_token,
            qr_code_id: existingQR.id,
          });
          continue;
        }

        // Generate new QR token
        const qrToken = generateSecureToken();

        // Calculate validity window
        const validFromTime = genType === "check_in" 
          ? `${String(Math.max(0, parseTime(workerStartTime).hours - 1)).padStart(2, "0")}:00`
          : `${String(Math.max(0, parseTime(workerEndTime).hours - 2)).padStart(2, "0")}:00`;
        
        const validUntilTime = genType === "check_in"
          ? `${String(Math.min(23, parseTime(workerStartTime).hours + 3)).padStart(2, "0")}:00`
          : `${String(Math.min(23, parseTime(workerEndTime).hours + 2)).padStart(2, "0")}:59`;

        const validFrom = createEthiopiaTimestamp(todayDate, validFromTime);
        const validUntil = createEthiopiaTimestamp(todayDate, validUntilTime);

        let qrCodeId: string | null = null;

        // Insert or update QR code
        if (existingQR) {
          const { data: updatedQR } = await supabase
            .from("daily_qr_codes")
            .update({
              qr_token: qrToken,
              valid_from: validFrom.toISOString(),
              valid_until: validUntil.toISOString(),
              used_at: null,
            })
            .eq("id", existingQR.id)
            .select("id")
            .single();
          qrCodeId = updatedQR?.id || existingQR.id;
        } else {
          const { data: newQR } = await supabase.from("daily_qr_codes").insert({
            worker_id: worker.id,
            owner_id: user.id,
            date: todayDate,
            type: genType,
            qr_token: qrToken,
            valid_from: validFrom.toISOString(),
            valid_until: validUntil.toISOString(),
          }).select("id").single();
          qrCodeId = newQR?.id || null;
        }

        console.log(`Generated ${genType} QR for ${worker.name}, valid from ${validFrom.toISOString()} to ${validUntil.toISOString()}`);

        let emailSent = false;
        let emailError: string | null = null;

        // Send email via SMTP and track delivery
        if (worker.email && smtpConfig && qrCodeId) {
          try {
            const scanUrl = `${appUrl}/scan?token=${qrToken}`;
            const typeLabel = genType === "check_in" ? "Check-In" : "Check-Out";
            const qrImageUrl = generateQRCodeImageUrl(scanUrl);
            
            const html = buildEmailHTML(
              worker.name,
              typeLabel,
              genType,
              todayDate,
              scanUrl,
              validFromTime,
              validUntilTime,
              qrImageUrl
            );

            const subject = `Your ${typeLabel} QR Code for ${todayDate}`;
            const emailResult = await sendEmailViaSMTP(smtpConfig, worker.email, subject, html);

            if (emailResult.success) {
              emailSent = true;
              console.log(`✅ Email sent to ${worker.email} for ${genType}`);
            } else {
              emailError = emailResult.error || "Unknown SMTP error";
              console.error(`❌ Failed to send email to ${worker.email}:`, emailError);
            }
          } catch (err) {
            emailError = err instanceof Error ? err.message : "Unknown email error";
            console.error(`❌ Failed to send email to ${worker.email}:`, emailError);
          }

          // Track email delivery in qr_email_delivery table
          try {
            await supabase.from("qr_email_delivery").upsert({
              qr_code_id: qrCodeId,
              worker_id: worker.id,
              qr_token: qrToken,
              email_address: worker.email,
              status: emailSent ? "sent" : "failed",
              email_sent_at: emailSent ? new Date().toISOString() : null,
              error_message: emailError,
              owner_id: user.id,
            }, { onConflict: "qr_code_id" });
          } catch (trackError) {
            console.error("Failed to track email delivery:", trackError);
          }
        } else if (!worker.email && qrCodeId) {
          // Log that worker has no email
          console.warn(`⚠️ Worker ${worker.name} has no email address, QR generated but not sent`);
          try {
            await supabase.from("qr_email_delivery").upsert({
              qr_code_id: qrCodeId,
              worker_id: worker.id,
              qr_token: qrToken,
              email_address: "none",
              status: "failed",
              error_message: "Worker has no email address",
              owner_id: user.id,
            }, { onConflict: "qr_code_id" });
          } catch (trackError) {
            console.error("Failed to track missing email:", trackError);
          }
        } else if (!smtpConfig && worker.email && qrCodeId) {
          // SMTP not configured
          console.warn(`⚠️ SMTP not configured, cannot send email to ${worker.email}`);
          try {
            await supabase.from("qr_email_delivery").upsert({
              qr_code_id: qrCodeId,
              worker_id: worker.id,
              qr_token: qrToken,
              email_address: worker.email,
              status: "failed",
              error_message: "SMTP not configured",
              owner_id: user.id,
            }, { onConflict: "qr_code_id" });
          } catch (trackError) {
            console.error("Failed to track SMTP config error:", trackError);
          }
        }

        results.push({
          worker_id: worker.id,
          worker_name: worker.name,
          type: genType,
          status: "generated",
          qr_token: qrToken,
          qr_code_id: qrCodeId,
          valid_from: validFrom.toISOString(),
          valid_until: validUntil.toISOString(),
          email_sent: emailSent,
          email_error: emailError,
        });
      }
    }

    const generatedCount = results.filter(r => r.status === "generated").length;
    const workersCount = new Set(results.map(r => r.worker_id)).size;
    const emailsSent = results.filter(r => r.email_sent === true).length;
    const emailsFailed = results.filter(r => r.email_error).length;

    console.log(`📊 Summary: ${generatedCount} QR codes generated for ${workersCount} workers, ${emailsSent} emails sent, ${emailsFailed} failed`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        generated: generatedCount,
        workers: workersCount,
        emails_sent: emailsSent,
        emails_failed: emailsFailed,
        results 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error generating QR codes:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
