import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIMEZONE = "Africa/Addis_Ababa";
const MAX_RETRIES = 3;

// Input validation schema
const RequestSchema = z.object({
  qr_code_id: z.string().uuid(),
  retry: z.boolean().optional().default(false),
});

// Batch send schema for multiple QR codes
const BatchRequestSchema = z.object({
  qr_code_ids: z.array(z.string().uuid()).min(1).max(50),
});

interface QRCodeWithWorker {
  id: string;
  worker_id: string;
  qr_token: string;
  type: string;
  date: string;
  valid_from: string;
  valid_until: string;
  owner_id: string;
  workers: {
    name: string;
    email: string | null;
  } | null;
}

interface DeliveryRecord {
  id: string;
  status: string;
  retry_count: number;
}

interface SMTPConfig {
  hostname: string;
  port: number;
  username: string;
  password: string;
  from: string;
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

// Generate QR code data URL using base64 encoding for email embedding
function generateQRCodeImageUrl(scanUrl: string): string {
  // Use quickchart.io with proper encoding for reliable email display
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
  validFromFormatted: string,
  validUntilFormatted: string,
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
              ${validFromFormatted} — ${validUntilFormatted}
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

// Send email for a single QR code
async function sendQREmail(
  smtpConfig: SMTPConfig,
  qrCode: QRCodeWithWorker,
  appUrl: string
): Promise<{ success: boolean; error?: string }> {
  const workerEmail = qrCode.workers?.email;
  const workerName = qrCode.workers?.name || "Worker";

  if (!workerEmail) {
    return { success: false, error: "Worker has no email address" };
  }

  const scanUrl = `${appUrl}/scan?token=${qrCode.qr_token}`;
  const typeLabel = qrCode.type === "check_in" ? "Check-In" : "Check-Out";
  const validFromFormatted = formatTime(qrCode.valid_from);
  const validUntilFormatted = formatTime(qrCode.valid_until);
  const qrImageUrl = generateQRCodeImageUrl(scanUrl);

  const html = buildEmailHTML(
    workerName,
    typeLabel,
    qrCode.type,
    qrCode.date,
    scanUrl,
    validFromFormatted,
    validUntilFormatted,
    qrImageUrl
  );

  const subject = `Your ${typeLabel} QR Code for ${qrCode.date}`;
  
  return await sendEmailViaSMTP(smtpConfig, workerEmail, subject, html);
}

async function processSingleQREmail(
  supabase: SupabaseClient,
  smtpConfig: SMTPConfig,
  qrCodeId: string,
  appUrl: string,
  isRetry: boolean
): Promise<{ success: boolean; error?: string; delivery_id?: string }> {
  try {
    // Fetch QR code with worker info
    const { data: qrCodeData, error: qrError } = await supabase
      .from("daily_qr_codes")
      .select(`
        id,
        worker_id,
        qr_token,
        type,
        date,
        valid_from,
        valid_until,
        owner_id,
        workers (
          name,
          email
        )
      `)
      .eq("id", qrCodeId)
      .maybeSingle();

    if (qrError || !qrCodeData) {
      console.error(`QR code not found: ${qrCodeId}`, qrError);
      return { success: false, error: "QR code not found" };
    }

    const qrCode = qrCodeData as unknown as QRCodeWithWorker;
    const workerEmail = qrCode.workers?.email;
    
    if (!workerEmail) {
      console.warn(`Worker ${qrCode.worker_id} has no email, skipping...`);
      
      // Still create a delivery record to track this
      await supabase.from("qr_email_delivery").upsert({
        qr_code_id: qrCode.id,
        worker_id: qrCode.worker_id,
        qr_token: qrCode.qr_token,
        email_address: "none",
        status: "failed",
        error_message: "Worker has no email address",
        owner_id: qrCode.owner_id,
      }, { onConflict: "qr_code_id" });

      return { success: false, error: "Worker has no email address" };
    }

    // Check existing delivery record
    const { data: existingDeliveryData } = await supabase
      .from("qr_email_delivery")
      .select("id, status, retry_count")
      .eq("qr_code_id", qrCodeId)
      .maybeSingle();

    const existingDelivery = existingDeliveryData as DeliveryRecord | null;

    // If already sent successfully and not a retry, skip
    if (existingDelivery?.status === "sent" && !isRetry) {
      console.log(`Email already sent for QR ${qrCodeId}, skipping...`);
      return { success: true, delivery_id: existingDelivery.id };
    }

    // Check max retries
    if (existingDelivery && existingDelivery.retry_count >= MAX_RETRIES && !isRetry) {
      console.warn(`Max retries (${MAX_RETRIES}) reached for QR ${qrCodeId}`);
      return { success: false, error: `Max retries (${MAX_RETRIES}) exceeded` };
    }

    // Update status to retrying if this is a retry
    if (isRetry && existingDelivery) {
      await supabase
        .from("qr_email_delivery")
        .update({ status: "retrying" })
        .eq("id", existingDelivery.id);
    }

    // Send the email
    const emailResult = await sendQREmail(smtpConfig, qrCode, appUrl);

    // Update or create delivery record
    const deliveryData = {
      qr_code_id: qrCode.id,
      worker_id: qrCode.worker_id,
      qr_token: qrCode.qr_token,
      email_address: workerEmail,
      status: emailResult.success ? "sent" : "failed",
      email_sent_at: emailResult.success ? new Date().toISOString() : null,
      error_message: emailResult.error || null,
      retry_count: (existingDelivery?.retry_count || 0) + (isRetry ? 1 : 0),
      owner_id: qrCode.owner_id,
    };

    const { data: delivery, error: deliveryError } = await supabase
      .from("qr_email_delivery")
      .upsert(deliveryData, { onConflict: "qr_code_id" })
      .select("id")
      .maybeSingle();

    if (deliveryError) {
      console.error("Failed to save delivery record:", deliveryError);
    }

    return { 
      success: emailResult.success, 
      error: emailResult.error,
      delivery_id: (delivery as { id: string } | null)?.id 
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`Error processing QR email ${qrCodeId}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Get SMTP configuration from environment
    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = Deno.env.get("SMTP_PORT");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");
    const smtpFrom = Deno.env.get("SMTP_FROM");

    // Validate SMTP configuration
    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !smtpFrom) {
      console.error("SMTP configuration incomplete. Missing:", {
        SMTP_HOST: !smtpHost,
        SMTP_PORT: !smtpPort,
        SMTP_USER: !smtpUser,
        SMTP_PASS: !smtpPass,
        SMTP_FROM: !smtpFrom,
      });
      return new Response(
        JSON.stringify({ error: "Email service not configured - missing SMTP credentials" }),
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

    console.log(`📧 SMTP configured: ${smtpHost}:${smtpPort} from ${smtpFrom}`);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const appUrl = Deno.env.get("APP_URL") || "https://qlobfbzhjtzzdjqxcrhu.lovable.app";

    const body = await req.json().catch(() => ({}));

    // Check if batch request
    const batchParse = BatchRequestSchema.safeParse(body);
    if (batchParse.success) {
      const { qr_code_ids } = batchParse.data;
      console.log(`📧 Processing batch email send for ${qr_code_ids.length} QR codes`);

      const results: Array<{ qr_code_id: string; success: boolean; error?: string }> = [];

      for (const qrCodeId of qr_code_ids) {
        const result = await processSingleQREmail(supabase, smtpConfig, qrCodeId, appUrl, false);
        results.push({ qr_code_id: qrCodeId, ...result });
      }

      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      console.log(`📊 Batch complete: ${successCount} sent, ${failCount} failed`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          summary: { sent: successCount, failed: failCount },
          results 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Single QR code request
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

    const { qr_code_id, retry } = parseResult.data;
    const result = await processSingleQREmail(supabase, smtpConfig, qr_code_id, appUrl, retry);

    return new Response(
      JSON.stringify(result),
      { 
        status: result.success ? 200 : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  } catch (error) {
    console.error("Error in send-qr-email function:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
