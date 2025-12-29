import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIMEZONE = "Africa/Addis_Ababa";

// Input validation schema
const RequestSchema = z.object({
  qr_token: z.string().min(32).max(128),
  scanner_id: z.string().uuid().optional(),
  check_type: z.enum(["check_in", "check_out"]).optional(),
});

function getEthiopiaDate(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
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
        JSON.stringify({ error: "Missing Authorization header", valid: false }),
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
        JSON.stringify({ error: "Invalid or expired token", valid: false }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Authenticated scanner user: ${user.id}`);

    // Use service role client for database operations (bypass RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ========== INPUT VALIDATION ==========
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body", valid: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const parseResult = RequestSchema.safeParse(body);
    if (!parseResult.success) {
      console.error("Input validation failed:", parseResult.error.errors);
      return new Response(
        JSON.stringify({ 
          error: "Invalid input", 
          details: parseResult.error.errors.map(e => e.message),
          valid: false 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { qr_token, scanner_id, check_type } = parseResult.data;

    console.log("Validating QR token for", check_type || "any", "action");

    const now = new Date();
    const todayDate = getEthiopiaDate();

    // Find the QR code record (using dynamic token from daily_qr_codes)
    const { data: qrRecord, error: qrError } = await supabase
      .from("daily_qr_codes")
      .select("*, workers(id, name, is_active, custom_start_time, custom_end_time, owner_id)")
      .eq("qr_token", qr_token)
      .maybeSingle();

    if (qrError) {
      console.error("Error fetching QR record:", qrError);
      return new Response(
        JSON.stringify({ error: "Database error", valid: false }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // QR token not found
    if (!qrRecord) {
      console.error("QR token not found");
      
      await supabase.from("incidents").insert({
        incident_type: "invalid_qr",
        description: "Invalid QR token attempted",
        scanner_id: scanner_id || null,
      });

      return new Response(
        JSON.stringify({ 
          error: "Invalid QR code", 
          valid: false,
          incident_logged: true 
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const worker = qrRecord.workers as {
      id: string;
      name: string;
      is_active: boolean;
      custom_start_time: string | null;
      custom_end_time: string | null;
      owner_id: string | null;
    };
    const qrType = qrRecord.type as "check_in" | "check_out";

    console.log(`Found QR for worker: ${worker.name}, type: ${qrType}, date: ${qrRecord.date}`);

    // Validate check_type matches if provided in request
    if (check_type && check_type !== qrType) {
      console.error(`Type mismatch: expected ${check_type}, got ${qrType}`);
      
      await supabase.from("incidents").insert({
        worker_id: worker.id,
        incident_type: "qr_type_mismatch",
        description: `Worker ${worker.name} scanned ${qrType} QR but request expected ${check_type}`,
        scanner_id: scanner_id || null,
      });

      return new Response(
        JSON.stringify({ 
          error: `This is a ${qrType.replace('_', '-')} QR code, not a ${check_type.replace('_', '-')} code.`, 
          valid: false,
          worker_name: worker.name,
          incident_logged: true 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if worker is active
    if (!worker.is_active) {
      console.error("Worker is inactive:", worker.id);
      
      await supabase.from("incidents").insert({
        worker_id: worker.id,
        incident_type: "inactive_worker_scan",
        description: `Inactive worker ${worker.name} attempted to scan ${qrType} QR`,
        scanner_id: scanner_id || null,
      });

      return new Response(
        JSON.stringify({ 
          error: "Worker is inactive", 
          valid: false,
          worker_name: worker.name,
          incident_logged: true 
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if QR is for today
    if (qrRecord.date !== todayDate) {
      console.error(`QR date mismatch: QR date ${qrRecord.date}, today ${todayDate}`);
      
      await supabase.from("incidents").insert({
        worker_id: worker.id,
        incident_type: "expired_qr",
        description: `Worker ${worker.name} used QR from ${qrRecord.date} on ${todayDate}`,
        scanner_id: scanner_id || null,
      });

      return new Response(
        JSON.stringify({ 
          error: "QR code is not valid for today", 
          valid: false,
          worker_name: worker.name,
          qr_date: qrRecord.date,
          today: todayDate,
          incident_logged: true 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already used
    if (qrRecord.used_at) {
      console.error(`QR already used at: ${qrRecord.used_at}`);
      
      await supabase.from("incidents").insert({
        worker_id: worker.id,
        incident_type: "qr_reuse",
        description: `Worker ${worker.name} attempted to reuse ${qrType} QR (originally used at ${qrRecord.used_at})`,
        scanner_id: scanner_id || null,
      });

      return new Response(
        JSON.stringify({ 
          error: "QR code has already been used", 
          valid: false,
          worker_name: worker.name,
          used_at: qrRecord.used_at,
          incident_logged: true 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check time validity
    const validFrom = new Date(qrRecord.valid_from);
    const validUntil = new Date(qrRecord.valid_until);

    if (now < validFrom || now > validUntil) {
      console.error(`QR time invalid: now=${now.toISOString()}, valid_from=${validFrom.toISOString()}, valid_until=${validUntil.toISOString()}`);
      
      await supabase.from("incidents").insert({
        worker_id: worker.id,
        incident_type: "expired_qr",
        description: `Worker ${worker.name} used ${qrType} QR outside valid time window (valid: ${validFrom.toISOString()} - ${validUntil.toISOString()})`,
        scanner_id: scanner_id || null,
      });

      return new Response(
        JSON.stringify({ 
          error: "QR code is not valid at this time", 
          valid: false,
          worker_name: worker.name,
          valid_from: qrRecord.valid_from,
          valid_until: qrRecord.valid_until,
          incident_logged: true 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for wrong type usage (e.g., using check-in QR when should check-out)
    const { data: existingAttendance } = await supabase
      .from("attendance")
      .select("*")
      .eq("worker_id", worker.id)
      .eq("date", todayDate)
      .maybeSingle();

    if (qrType === "check_in" && existingAttendance?.check_in) {
      console.error(`Worker ${worker.name} already checked in, but trying to use check_in QR`);
      
      await supabase.from("incidents").insert({
        worker_id: worker.id,
        incident_type: "wrong_qr_type",
        description: `Worker ${worker.name} attempted to use check-in QR after already checking in`,
        scanner_id: scanner_id || null,
      });

      return new Response(
        JSON.stringify({ 
          error: "You have already checked in today. Use your check-out QR code.", 
          valid: false,
          worker_name: worker.name,
          incident_logged: true 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (qrType === "check_out" && !existingAttendance?.check_in) {
      console.error(`Worker ${worker.name} trying to check out without checking in`);
      
      await supabase.from("incidents").insert({
        worker_id: worker.id,
        incident_type: "wrong_qr_type",
        description: `Worker ${worker.name} attempted to check out without checking in first`,
        scanner_id: scanner_id || null,
      });

      return new Response(
        JSON.stringify({ 
          error: "You must check in first before checking out.", 
          valid: false,
          worker_name: worker.name,
          incident_logged: true 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (qrType === "check_out" && existingAttendance?.check_out) {
      console.error(`Worker ${worker.name} already checked out`);
      
      await supabase.from("incidents").insert({
        worker_id: worker.id,
        incident_type: "double_checkout",
        description: `Worker ${worker.name} attempted to check out again (already checked out at ${existingAttendance.check_out})`,
        scanner_id: scanner_id || null,
      });

      return new Response(
        JSON.stringify({ 
          error: "You have already checked out today.", 
          valid: false,
          worker_name: worker.name,
          incident_logged: true 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // All validations passed - mark QR as used
    await supabase
      .from("daily_qr_codes")
      .update({ used_at: now.toISOString() })
      .eq("id", qrRecord.id);

    // Get settings for late threshold and end time
    const { data: settingsData } = await supabase
      .from("settings")
      .select("default_start_time, default_end_time, late_threshold_minutes")
      .limit(1)
      .maybeSingle();

    const defaultStartTime = settingsData?.default_start_time || "08:00";
    const defaultEndTime = settingsData?.default_end_time || "17:00";
    const lateThreshold = settingsData?.late_threshold_minutes || 15;
    const workerStartTime = worker.custom_start_time || defaultStartTime;
    const workerEndTime = worker.custom_end_time || defaultEndTime;

    // Get current time in Ethiopia timezone
    const etTimeFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const currentTimeStr = etTimeFormatter.format(now);
    const [currentHour, currentMinute] = currentTimeStr.split(":").map(Number);
    const currentMinutes = currentHour * 60 + currentMinute;

    const [startHour, startMinute] = workerStartTime.split(":").map(Number);
    const startMinutes = startHour * 60 + startMinute;

    const [endHour, endMinute] = workerEndTime.split(":").map(Number);
    const endMinutes = endHour * 60 + endMinute;

    // Calculate if late (for check-in only)
    let isLate = false;
    let isEarlyCheckout = false;

    if (qrType === "check_in") {
      isLate = currentMinutes > startMinutes + lateThreshold;
      
      // Check-in is allowed from 30 minutes before start time onwards
      const earliestCheckIn = startMinutes - 30;
      if (currentMinutes < earliestCheckIn) {
        console.error(`Check-in too early: current ${currentMinutes} min, earliest allowed ${earliestCheckIn} min`);
        
        await supabase.from("incidents").insert({
          worker_id: worker.id,
          incident_type: "early_checkin_attempt",
          description: `Worker ${worker.name} attempted to check in at ${currentTimeStr}, but earliest allowed is 30 minutes before ${workerStartTime}`,
          scanner_id: scanner_id || null,
        });

        return new Response(
          JSON.stringify({ 
            error: `Check-in not allowed yet. You can check in from 30 minutes before your start time (${workerStartTime}).`, 
            valid: false,
            worker_name: worker.name,
            incident_logged: true 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Check-out: detect early checkout (before scheduled end time)
      if (currentMinutes < endMinutes) {
        isEarlyCheckout = true;
        console.log(`Early checkout detected for ${worker.name}: current ${currentTimeStr}, expected end ${workerEndTime}`);
      }
    }

    // Update attendance
    const nowISO = now.toISOString();
    let newStatus: "in" | "out" | "late";

    if (qrType === "check_in") {
      newStatus = isLate ? "late" : "in";

      if (existingAttendance) {
        await supabase
          .from("attendance")
          .update({
            check_in: nowISO,
            status: newStatus,
            is_late: isLate,
            scanner_id: scanner_id || null,
            updated_at: nowISO,
          })
          .eq("id", existingAttendance.id);
      } else {
        await supabase.from("attendance").insert({
          worker_id: worker.id,
          date: todayDate,
          check_in: nowISO,
          status: newStatus,
          is_late: isLate,
          scanner_id: scanner_id || null,
        });
      }

      console.log(`Check-in recorded for ${worker.name}, isLate: ${isLate}`);
    } else {
      newStatus = "out";

      await supabase
        .from("attendance")
        .update({
          check_out: nowISO,
          status: newStatus,
          scanner_id: scanner_id || null,
          updated_at: nowISO,
        })
        .eq("id", existingAttendance!.id);

      // Create early_checkout incident if applicable
      if (isEarlyCheckout) {
        await supabase.from("incidents").insert({
          worker_id: worker.id,
          incident_type: "early_checkout",
          description: `Worker ${worker.name} checked out at ${currentTimeStr}, before scheduled end time ${workerEndTime}`,
          scanner_id: scanner_id || null,
        });
        console.log(`Early checkout incident created for ${worker.name}`);
      }

      console.log(`Check-out recorded for ${worker.name}, early: ${isEarlyCheckout}`);
    }

    return new Response(
      JSON.stringify({
        valid: true,
        success: true,
        action: qrType,
        status: newStatus,
        worker_name: worker.name,
        is_late: isLate,
        is_early_checkout: isEarlyCheckout,
        timestamp: nowISO,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", valid: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
