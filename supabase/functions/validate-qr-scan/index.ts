import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIMEZONE = "Africa/Addis_Ababa";

// Input validation schema - all fields are nullable/optional for safety
const RequestSchema = z.object({
  qr_token: z.string().min(32).max(128),
  scanner_id: z.string().uuid().nullish().transform(val => val || undefined),
  check_type: z.enum(["check_in", "check_out"]).nullish().transform(val => val || undefined),
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

function getEthiopiaTimeStr(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(date);
}

function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.split(":");
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Use service role client for all database operations (bypasses RLS for edge function)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ========== INPUT VALIDATION ==========
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      console.error("Invalid JSON body received");
      return new Response(
        JSON.stringify({ success: false, error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const parseResult = RequestSchema.safeParse(body);
    if (!parseResult.success) {
      console.error("Input validation failed:", parseResult.error.errors);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Invalid input", 
          details: parseResult.error.errors.map(e => e.message) 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { qr_token, scanner_id } = parseResult.data;

    console.log(`Processing QR scan - scanner: ${scanner_id || "none"}`);

    const now = new Date();
    const todayDate = getEthiopiaDate();
    const currentTimeStr = getEthiopiaTimeStr(now);
    const currentMinutes = parseTimeToMinutes(currentTimeStr);

    // ========== OPTIONAL SCANNER VALIDATION ==========
    if (scanner_id) {
      const { data: scanner, error: scannerError } = await supabase
        .from("scanners")
        .select("id, is_active, owner_id")
        .eq("id", scanner_id)
        .maybeSingle();

      if (scannerError) {
        console.error("Error fetching scanner:", scannerError);
        return new Response(
          JSON.stringify({ success: false, error: "Database error while validating scanner" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!scanner) {
        console.error("Scanner not found:", scanner_id);
        return new Response(
          JSON.stringify({ success: false, error: "Invalid scanner" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!scanner.is_active) {
        console.error("Scanner is inactive:", scanner_id);
        return new Response(
          JSON.stringify({ success: false, error: "Scanner is inactive" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Scanner validated: ${scanner_id}, owner: ${scanner.owner_id}`);
    }

    // ========== QR TOKEN LOOKUP ==========
    const { data: qrRecord, error: qrError } = await supabase
      .from("daily_qr_codes")
      .select("*, workers(id, name, is_active, custom_start_time, custom_end_time, owner_id)")
      .eq("qr_token", qr_token)
      .maybeSingle();

    if (qrError) {
      console.error("Error fetching QR record:", qrError);
      return new Response(
        JSON.stringify({ success: false, error: "Database error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // QR token not found
    if (!qrRecord) {
      console.error("QR token not found");
      
      // Log incident without worker_id (anonymous invalid scan)
      await supabase.from("incidents").insert({
        incident_type: "invalid_qr",
        description: "Invalid QR token scanned",
        scanner_id: scanner_id || null,
        worker_id: null,
        owner_id: null,
      });

      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Invalid QR code", 
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
    
    // Determine QR type: "check_in" or "check_out"
    const qrType = qrRecord.type as "check_in" | "check_out";
    const ownerId = worker.owner_id;

    console.log(`Found QR for worker: ${worker.name}, type: ${qrType}, date: ${qrRecord.date}`);

    // ========== VALIDATIONS ==========
    
    // 1. Check if worker is active
    if (!worker.is_active) {
      console.error("Worker is inactive:", worker.id);
      
      await supabase.from("incidents").insert({
        worker_id: worker.id,
        owner_id: ownerId,
        incident_type: "inactive_worker_scan",
        description: `Inactive worker attempted scan`,
        scanner_id: scanner_id || null,
      });

      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Worker is inactive", 
          worker_name: worker.name,
          incident_logged: true 
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Check if QR is for today
    if (qrRecord.date !== todayDate) {
      console.error(`QR date mismatch: QR=${qrRecord.date}, today=${todayDate}`);
      
      await supabase.from("incidents").insert({
        worker_id: worker.id,
        owner_id: ownerId,
        incident_type: "expired_qr",
        description: `Used QR from ${qrRecord.date} on ${todayDate}`,
        scanner_id: scanner_id || null,
      });

      return new Response(
        JSON.stringify({ 
          success: false,
          error: "QR code expired - not valid for today", 
          worker_name: worker.name,
          qr_date: qrRecord.date,
          today: todayDate,
          incident_logged: true 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Check if already used (double scan)
    if (qrRecord.used_at) {
      console.error(`QR already used at: ${qrRecord.used_at}`);
      
      await supabase.from("incidents").insert({
        worker_id: worker.id,
        owner_id: ownerId,
        incident_type: "double_scan",
        description: `Attempted to reuse ${qrType} QR (used at ${qrRecord.used_at})`,
        scanner_id: scanner_id || null,
      });

      return new Response(
        JSON.stringify({ 
          success: false,
          error: qrType === "check_in" ? "Already checked in" : "Already checked out", 
          worker_name: worker.name,
          used_at: qrRecord.used_at,
          incident_logged: true 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Check time window validity
    const validFrom = new Date(qrRecord.valid_from);
    const validUntil = new Date(qrRecord.valid_until);

    if (now < validFrom) {
      console.error(`QR not yet valid: now=${now.toISOString()}, valid_from=${validFrom.toISOString()}`);
      
      await supabase.from("incidents").insert({
        worker_id: worker.id,
        owner_id: ownerId,
        incident_type: "early_scan",
        description: `Scanned ${qrType} QR before valid time (valid from ${validFrom.toISOString()})`,
        scanner_id: scanner_id || null,
      });

      return new Response(
        JSON.stringify({ 
          success: false,
          error: "QR code not yet valid - too early", 
          worker_name: worker.name,
          valid_from: qrRecord.valid_from,
          incident_logged: true 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (now > validUntil) {
      console.error(`QR expired: now=${now.toISOString()}, valid_until=${validUntil.toISOString()}`);
      
      await supabase.from("incidents").insert({
        worker_id: worker.id,
        owner_id: ownerId,
        incident_type: "expired_qr",
        description: `Scanned ${qrType} QR after valid time (expired at ${validUntil.toISOString()})`,
        scanner_id: scanner_id || null,
      });

      return new Response(
        JSON.stringify({ 
          success: false,
          error: "QR code expired", 
          worker_name: worker.name,
          valid_until: qrRecord.valid_until,
          incident_logged: true 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========== CHECK EXISTING ATTENDANCE ==========
    const { data: existingAttendance, error: attError } = await supabase
      .from("attendance")
      .select("*")
      .eq("worker_id", worker.id)
      .eq("date", todayDate)
      .maybeSingle();

    if (attError) {
      console.error("Error fetching attendance:", attError);
      return new Response(
        JSON.stringify({ success: false, error: "Database error fetching attendance" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Validate logical flow
    if (qrType === "check_in" && existingAttendance?.check_in) {
      console.error(`Already checked in for today`);
      
      await supabase.from("incidents").insert({
        worker_id: worker.id,
        owner_id: ownerId,
        incident_type: "double_scan",
        description: `Attempted check-in but already checked in at ${existingAttendance.check_in}`,
        scanner_id: scanner_id || null,
      });

      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Already checked in today", 
          worker_name: worker.name,
          check_in: existingAttendance.check_in,
          status: existingAttendance.status,
          incident_logged: true 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (qrType === "check_out" && !existingAttendance?.check_in) {
      console.error(`Checkout without check-in`);
      
      await supabase.from("incidents").insert({
        worker_id: worker.id,
        owner_id: ownerId,
        incident_type: "wrong_qr_type",
        description: `Attempted check-out without checking in first`,
        scanner_id: scanner_id || null,
      });

      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Cannot check out before check-in", 
          worker_name: worker.name,
          incident_logged: true 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (qrType === "check_out" && existingAttendance?.check_out) {
      console.error(`Already checked out`);
      
      await supabase.from("incidents").insert({
        worker_id: worker.id,
        owner_id: ownerId,
        incident_type: "double_scan",
        description: `Attempted check-out but already checked out at ${existingAttendance.check_out}`,
        scanner_id: scanner_id || null,
      });

      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Already checked out today", 
          worker_name: worker.name,
          check_out: existingAttendance.check_out,
          incident_logged: true 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========== MARK QR AS USED (CRITICAL: must succeed before attendance update) ==========
    const { error: updateQrError, data: updatedQr } = await supabase
      .from("daily_qr_codes")
      .update({ used_at: now.toISOString() })
      .eq("id", qrRecord.id)
      .is("used_at", null) // Only update if not already used (race condition protection)
      .select()
      .maybeSingle();

    if (updateQrError) {
      console.error("Failed to mark QR as used:", updateQrError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to process QR code" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If no row was updated, QR was already used (race condition)
    if (!updatedQr) {
      console.error("QR was used by another request (race condition)");
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: qrType === "check_in" ? "Already checked in" : "Already checked out",
          worker_name: worker.name 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========== GET SETTINGS FOR LATE THRESHOLD ==========
    const { data: settingsData } = await supabase
      .from("settings")
      .select("default_start_time, default_end_time, late_threshold_minutes")
      .eq("owner_id", ownerId)
      .maybeSingle();

    const defaultStartTime = settingsData?.default_start_time || "09:00";
    const defaultEndTime = settingsData?.default_end_time || "17:00";
    const lateThreshold = settingsData?.late_threshold_minutes || 15;
    const workerStartTime = worker.custom_start_time || defaultStartTime;
    const workerEndTime = worker.custom_end_time || defaultEndTime;

    const startMinutes = parseTimeToMinutes(workerStartTime.substring(0, 5));
    const endMinutes = parseTimeToMinutes(workerEndTime.substring(0, 5));

    // ========== UPDATE ATTENDANCE ==========
    const nowISO = now.toISOString();
    let newStatus: "in" | "out" | "late";
    let isLate = false;
    let isEarlyCheckout = false;
    let incidentCreated = false;

    if (qrType === "check_in") {
      // Check if late
      isLate = currentMinutes > startMinutes + lateThreshold;
      newStatus = isLate ? "late" : "in";

      // Log late check-in incident
      if (isLate) {
        incidentCreated = true;
        await supabase.from("incidents").insert({
          worker_id: worker.id,
          owner_id: ownerId,
          incident_type: "late_checkin",
          description: `Checked in at ${currentTimeStr}, scheduled start was ${workerStartTime} (${lateThreshold}min threshold)`,
          scanner_id: scanner_id || null,
        });
        console.log(`Late check-in incident logged for ${worker.name}`);
      }

      if (existingAttendance) {
        // Update existing attendance row
        const { error: updateError } = await supabase
          .from("attendance")
          .update({
            check_in: nowISO,
            status: newStatus,
            is_late: isLate,
            scanner_id: scanner_id || null,
            updated_at: nowISO,
          })
          .eq("id", existingAttendance.id);

        if (updateError) {
          console.error("Failed to update attendance:", updateError);
          return new Response(
            JSON.stringify({ success: false, error: "Failed to record check-in" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        // Insert new attendance row
        const { error: insertError } = await supabase.from("attendance").insert({
          worker_id: worker.id,
          owner_id: ownerId,
          date: todayDate,
          check_in: nowISO,
          status: newStatus,
          is_late: isLate,
          scanner_id: scanner_id || null,
        });

        if (insertError) {
          console.error("Failed to insert attendance:", insertError);
          return new Response(
            JSON.stringify({ success: false, error: "Failed to record check-in" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      console.log(`Check-in recorded for ${worker.name}, isLate: ${isLate}, time: ${currentTimeStr}`);
    } else {
      // Check-out logic
      newStatus = "out";
      let isLateCheckout = false;
      
      // Detect early checkout (before scheduled end time)
      if (currentMinutes < endMinutes) {
        isEarlyCheckout = true;
        incidentCreated = true;
        
        await supabase.from("incidents").insert({
          worker_id: worker.id,
          owner_id: ownerId,
          incident_type: "early_checkout",
          description: `Checked out at ${currentTimeStr}, scheduled end was ${workerEndTime}`,
          scanner_id: scanner_id || null,
        });
        
        console.log(`Early checkout incident logged for ${worker.name}`);
      }
      
      // Detect late checkout (more than 30 minutes after scheduled end time)
      const lateCheckoutThreshold = 30; // minutes
      if (currentMinutes > endMinutes + lateCheckoutThreshold) {
        isLateCheckout = true;
        incidentCreated = true;
        
        await supabase.from("incidents").insert({
          worker_id: worker.id,
          owner_id: ownerId,
          incident_type: "late_checkout",
          description: `Checked out at ${currentTimeStr}, scheduled end was ${workerEndTime} (${currentMinutes - endMinutes} minutes late)`,
          scanner_id: scanner_id || null,
        });
        
        console.log(`Late checkout incident logged for ${worker.name}`);
      }

      // Update attendance with check-out
      const { error: updateError } = await supabase
        .from("attendance")
        .update({
          check_out: nowISO,
          status: newStatus,
          scanner_id: scanner_id || null,
          updated_at: nowISO,
        })
        .eq("id", existingAttendance!.id);

      if (updateError) {
        console.error("Failed to update attendance with check-out:", updateError);
        return new Response(
          JSON.stringify({ success: false, error: "Failed to record check-out" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Check-out recorded for ${worker.name}, isEarly: ${isEarlyCheckout}, isLate: ${isLateCheckout}, time: ${currentTimeStr}`);
    }

    // ========== SUCCESS RESPONSE ==========
    return new Response(
      JSON.stringify({
        success: true,
        valid: true,
        action: qrType,
        status: newStatus,
        worker_id: worker.id,
        worker_name: worker.name,
        is_late: isLate,
        is_early_checkout: isEarlyCheckout,
        incident_created: incidentCreated,
        check_in: qrType === "check_in" ? nowISO : existingAttendance?.check_in,
        check_out: qrType === "check_out" ? nowISO : null,
        timestamp: nowISO,
        time: currentTimeStr,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
