import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    }
    const results: QRResult[] = [];

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

        // NOTE: Emails are NOT sent here anymore.
        // The 'send-scheduled-qr-emails' function handles all email delivery
        // at the scheduled times (worker's start_time for check_in, end_time for check_out)

        results.push({
          worker_id: worker.id,
          worker_name: worker.name,
          type: genType,
          status: "generated",
          qr_token: qrToken,
          qr_code_id: qrCodeId,
          valid_from: validFrom.toISOString(),
          valid_until: validUntil.toISOString(),
        });
      }
    }

    const generatedCount = results.filter(r => r.status === "generated").length;
    const workersCount = new Set(results.map(r => r.worker_id)).size;

    console.log(`📊 Summary: ${generatedCount} QR codes generated for ${workersCount} workers (emails will be sent by scheduled function)`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        generated: generatedCount,
        workers: workersCount,
        results,
        note: "Emails will be sent by the scheduled email function at each worker's start/end time"
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
