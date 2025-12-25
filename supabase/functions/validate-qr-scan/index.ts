import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIMEZONE = "Africa/Addis_Ababa";

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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { qr_token, scanner_id } = await req.json();

    if (!qr_token) {
      console.error("Missing qr_token in request");
      return new Response(
        JSON.stringify({ error: "Missing qr_token", valid: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Validating QR token:", qr_token.substring(0, 10) + "...");

    const now = new Date();
    const todayDate = getEthiopiaDate();

    // Find the QR code record
    const { data: qrRecord, error: qrError } = await supabase
      .from("daily_qr_codes")
      .select("*, workers(*)")
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
      console.error("QR token not found:", qr_token.substring(0, 10) + "...");
      
      await supabase.from("incidents").insert({
        incident_type: "invalid_qr",
        description: `Invalid QR token attempted: ${qr_token.substring(0, 16)}...`,
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

    const worker = qrRecord.workers;
    const qrType = qrRecord.type as "check_in" | "check_out";

    console.log(`Found QR for worker: ${worker.name}, type: ${qrType}, date: ${qrRecord.date}`);

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
        incident_type: "wrong_date_qr",
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

    // Get settings for late threshold
    const { data: settingsData } = await supabase
      .from("settings")
      .select("default_start_time, late_threshold_minutes")
      .limit(1)
      .maybeSingle();

    const defaultStartTime = settingsData?.default_start_time || "08:00";
    const lateThreshold = settingsData?.late_threshold_minutes || 15;
    const workerStartTime = worker.custom_start_time || defaultStartTime;

    // Calculate if late (for check-in only)
    let isLate = false;
    if (qrType === "check_in") {
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

      isLate = currentMinutes > startMinutes + lateThreshold;
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

      console.log(`Check-out recorded for ${worker.name}`);
    }

    return new Response(
      JSON.stringify({
        valid: true,
        success: true,
        action: qrType,
        status: newStatus,
        worker_name: worker.name,
        is_late: isLate,
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
