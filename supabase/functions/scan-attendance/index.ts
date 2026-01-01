import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIMEZONE = "Africa/Addis_Ababa";

// Input validation schema - uses qr_token from daily_qr_codes, NOT static qr_secret
const RequestSchema = z.object({
  qr_token: z.string().min(32).max(128),
  scanner_id: z.string().uuid().optional(),
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
  // Handle CORS preflight
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

    console.log(`Authenticated scanner user: ${user.id}`);

    // Use service role client for database operations (bypass RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ========== INPUT VALIDATION ==========
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    const { qr_token, scanner_id } = parseResult.data;

    console.log("Processing scan for dynamic QR token");

    const now = new Date();
    const todayDate = getEthiopiaDate();

    // ========== DYNAMIC QR TOKEN VALIDATION ==========
    // Find QR code in daily_qr_codes table (NOT using static qr_secret)
    const { data: qrRecord, error: qrError } = await supabase
      .from("daily_qr_codes")
      .select("*, workers(id, name, is_active, custom_start_time, custom_end_time, owner_id)")
      .eq("qr_token", qr_token)
      .maybeSingle();

    if (qrError) {
      console.error("Error fetching QR record:", qrError);
      return new Response(
        JSON.stringify({ error: "Database error" }),
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
        worker_id: null,
      });

      return new Response(
        JSON.stringify({ error: "Invalid QR code", incident_logged: true }),
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
    const ownerId = worker.owner_id;

    console.log(`Found QR for worker: ${worker.name}, type: ${qrType}, date: ${qrRecord.date}`);

    // Validate worker is active
    if (!worker.is_active) {
      console.error("Worker is inactive:", worker.id);
      
      await supabase.from("incidents").insert({
        worker_id: worker.id,
        owner_id: ownerId,
        incident_type: "inactive_worker_scan",
        description: `Inactive worker ${worker.name} attempted to scan ${qrType} QR`,
        scanner_id: scanner_id || null,
      });

      return new Response(
        JSON.stringify({ error: "Worker is inactive", worker_name: worker.name, incident_logged: true }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate QR is for today
    if (qrRecord.date !== todayDate) {
      console.error(`QR date mismatch: QR date ${qrRecord.date}, today ${todayDate}`);
      
      await supabase.from("incidents").insert({
        worker_id: worker.id,
        owner_id: ownerId,
        incident_type: "expired_qr",
        description: `Worker ${worker.name} used QR from ${qrRecord.date} on ${todayDate}`,
        scanner_id: scanner_id || null,
      });

      return new Response(
        JSON.stringify({ 
          error: "QR code is not valid for today", 
          worker_name: worker.name,
          incident_logged: true 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate QR is not already used
    if (qrRecord.used_at) {
      console.error(`QR already used at: ${qrRecord.used_at}`);
      
      await supabase.from("incidents").insert({
        worker_id: worker.id,
        owner_id: ownerId,
        incident_type: "qr_reuse",
        description: `Worker ${worker.name} attempted to reuse ${qrType} QR (originally used at ${qrRecord.used_at})`,
        scanner_id: scanner_id || null,
      });

      return new Response(
        JSON.stringify({ 
          error: "QR code has already been used", 
          worker_name: worker.name,
          incident_logged: true 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate time window
    const validFrom = new Date(qrRecord.valid_from);
    const validUntil = new Date(qrRecord.valid_until);

    if (now < validFrom || now > validUntil) {
      console.error(`QR time invalid: now=${now.toISOString()}, valid_from=${validFrom.toISOString()}, valid_until=${validUntil.toISOString()}`);
      
      await supabase.from("incidents").insert({
        worker_id: worker.id,
        owner_id: ownerId,
        incident_type: "expired_qr",
        description: `Worker ${worker.name} used ${qrType} QR outside valid time window`,
        scanner_id: scanner_id || null,
      });

      return new Response(
        JSON.stringify({ 
          error: "QR code is not valid at this time", 
          worker_name: worker.name,
          incident_logged: true 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check existing attendance
    const { data: existingAttendance, error: attError } = await supabase
      .from("attendance")
      .select("*")
      .eq("worker_id", worker.id)
      .eq("date", todayDate)
      .maybeSingle();

    if (attError) {
      console.error("Error fetching attendance:", attError);
      return new Response(
        JSON.stringify({ error: "Database error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate QR type matches expected action
    if (qrType === "check_in" && existingAttendance?.check_in) {
      await supabase.from("incidents").insert({
        worker_id: worker.id,
        owner_id: ownerId,
        incident_type: "wrong_qr_type",
        description: `Worker ${worker.name} attempted to use check-in QR after already checking in`,
        scanner_id: scanner_id || null,
      });

      return new Response(
        JSON.stringify({ 
          error: "You have already checked in today", 
          worker_name: worker.name,
          incident_logged: true 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (qrType === "check_out" && !existingAttendance?.check_in) {
      await supabase.from("incidents").insert({
        worker_id: worker.id,
        owner_id: ownerId,
        incident_type: "wrong_qr_type",
        description: `Worker ${worker.name} attempted to check out without checking in first`,
        scanner_id: scanner_id || null,
      });

      return new Response(
        JSON.stringify({ 
          error: "You must check in first", 
          worker_name: worker.name,
          incident_logged: true 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (qrType === "check_out" && existingAttendance?.check_out) {
      await supabase.from("incidents").insert({
        worker_id: worker.id,
        owner_id: ownerId,
        incident_type: "double_checkout",
        description: `Worker ${worker.name} attempted to check out again`,
        scanner_id: scanner_id || null,
      });

      return new Response(
        JSON.stringify({ 
          error: "You have already checked out today", 
          worker_name: worker.name,
          incident_logged: true 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark QR as used
    await supabase
      .from("daily_qr_codes")
      .update({ used_at: now.toISOString() })
      .eq("id", qrRecord.id);

    // Get settings for late threshold
    const { data: settingsData } = await supabase
      .from("settings")
      .select("default_start_time, default_end_time, late_threshold_minutes")
      .limit(1)
      .maybeSingle();

    const defaultStartTime = settingsData?.default_start_time || "09:00:00";
    const defaultEndTime = settingsData?.default_end_time || "17:00";
    const lateThreshold = settingsData?.late_threshold_minutes || 15;
    const workerStartTime = worker.custom_start_time || defaultStartTime;
    const workerEndTime = worker.custom_end_time || defaultEndTime;

    // Calculate current time in Ethiopia
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

    const nowISO = now.toISOString();
    let action: "check_in" | "check_out" = qrType;
    let newStatus: "in" | "out" | "late";
    let isLate = false;
    let isEarlyCheckout = false;

    if (qrType === "check_in") {
      isLate = currentMinutes > startMinutes + lateThreshold;
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
          owner_id: ownerId,
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
      
      // Detect early checkout
      if (currentMinutes < endMinutes) {
        isEarlyCheckout = true;
        
        await supabase.from("incidents").insert({
          worker_id: worker.id,
          owner_id: ownerId,
          incident_type: "early_checkout",
          description: `Worker ${worker.name} checked out at ${currentTimeStr}, before scheduled end time ${workerEndTime}`,
          scanner_id: scanner_id || null,
        });
        
        console.log(`Early checkout incident created for ${worker.name}`);
      }

      await supabase
        .from("attendance")
        .update({
          check_out: nowISO,
          status: newStatus,
          scanner_id: scanner_id || null,
          updated_at: nowISO,
        })
        .eq("id", existingAttendance!.id);

      console.log(`Check-out recorded for ${worker.name}, early: ${isEarlyCheckout}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        action,
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
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
