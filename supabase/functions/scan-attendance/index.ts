import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIMEZONE = "Africa/Addis_Ababa";

// Input validation schema - supports legacy qr_secret or new qr_token
const RequestSchema = z.object({
  qr_token: z.string().min(32).max(128).optional(),
  qr_secret: z.string().uuid().optional(),
  scanner_id: z.string().uuid().nullish().transform(val => val || undefined),
}).refine(data => data.qr_token || data.qr_secret, {
  message: "Either qr_token or qr_secret is required"
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

    // Use service role client for all database operations
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
          error: "Invalid input - provide qr_token or qr_secret", 
          details: parseResult.error.errors.map(e => e.message) 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { qr_token, qr_secret, scanner_id } = parseResult.data;

    const now = new Date();
    const todayDate = getEthiopiaDate();
    const currentTimeStr = getEthiopiaTimeStr(now);
    const currentMinutes = parseTimeToMinutes(currentTimeStr);

    console.log(`Processing scan - token: ${qr_token ? "yes" : "no"}, secret: ${qr_secret ? "yes" : "no"}, scanner: ${scanner_id || "none"}`);

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
          JSON.stringify({ success: false, error: "Database error validating scanner" }),
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
    }

    // ========== ROUTE: NEW TOKEN-BASED QR ==========
    if (qr_token) {
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

      if (!qrRecord) {
        console.error("QR token not found");
        await supabase.from("incidents").insert({
          incident_type: "invalid_qr",
          description: "Invalid QR token scanned",
          scanner_id: scanner_id || null,
          worker_id: null,
        });

        return new Response(
          JSON.stringify({ success: false, error: "Invalid QR code", incident_logged: true }),
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

      // Validate worker active
      if (!worker.is_active) {
        await supabase.from("incidents").insert({
          worker_id: worker.id,
          owner_id: ownerId,
          incident_type: "inactive_worker_scan",
          description: "Inactive worker attempted scan",
          scanner_id: scanner_id || null,
        });
        return new Response(
          JSON.stringify({ success: false, error: "Worker is inactive", worker_name: worker.name }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate date
      if (qrRecord.date !== todayDate) {
        await supabase.from("incidents").insert({
          worker_id: worker.id,
          owner_id: ownerId,
          incident_type: "expired_qr",
          description: `Used QR from ${qrRecord.date} on ${todayDate}`,
          scanner_id: scanner_id || null,
        });
        return new Response(
          JSON.stringify({ success: false, error: "QR code expired", worker_name: worker.name }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate not already used
      if (qrRecord.used_at) {
        await supabase.from("incidents").insert({
          worker_id: worker.id,
          owner_id: ownerId,
          incident_type: "double_scan",
          description: `Attempted to reuse ${qrType} QR`,
          scanner_id: scanner_id || null,
        });
        return new Response(
          JSON.stringify({ success: false, error: "QR code already used", worker_name: worker.name }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate time window
      const validFrom = new Date(qrRecord.valid_from);
      const validUntil = new Date(qrRecord.valid_until);

      if (now < validFrom || now > validUntil) {
        await supabase.from("incidents").insert({
          worker_id: worker.id,
          owner_id: ownerId,
          incident_type: now < validFrom ? "early_scan" : "expired_qr",
          description: `Scanned ${qrType} QR outside valid time window`,
          scanner_id: scanner_id || null,
        });
        return new Response(
          JSON.stringify({ success: false, error: "QR code not valid at this time", worker_name: worker.name }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check existing attendance
      const { data: existingAttendance } = await supabase
        .from("attendance")
        .select("*")
        .eq("worker_id", worker.id)
        .eq("date", todayDate)
        .maybeSingle();

      // Validate logical flow
      if (qrType === "check_in" && existingAttendance?.check_in) {
        await supabase.from("incidents").insert({
          worker_id: worker.id,
          owner_id: ownerId,
          incident_type: "double_scan",
          description: "Already checked in",
          scanner_id: scanner_id || null,
        });
        return new Response(
          JSON.stringify({ success: false, error: "Already checked in today", worker_name: worker.name }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (qrType === "check_out" && !existingAttendance?.check_in) {
        await supabase.from("incidents").insert({
          worker_id: worker.id,
          owner_id: ownerId,
          incident_type: "wrong_qr_type",
          description: "Check-out without check-in",
          scanner_id: scanner_id || null,
        });
        return new Response(
          JSON.stringify({ success: false, error: "Must check in first", worker_name: worker.name }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (qrType === "check_out" && existingAttendance?.check_out) {
        await supabase.from("incidents").insert({
          worker_id: worker.id,
          owner_id: ownerId,
          incident_type: "double_scan",
          description: "Already checked out",
          scanner_id: scanner_id || null,
        });
        return new Response(
          JSON.stringify({ success: false, error: "Already checked out today", worker_name: worker.name }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Mark QR as used
      await supabase
        .from("daily_qr_codes")
        .update({ used_at: now.toISOString() })
        .eq("id", qrRecord.id)
        .is("used_at", null);

      // Get settings
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

      const nowISO = now.toISOString();
      let newStatus: "in" | "out" | "late";
      let isLate = false;
      let isEarlyCheckout = false;

      if (qrType === "check_in") {
        isLate = currentMinutes > startMinutes + lateThreshold;
        newStatus = isLate ? "late" : "in";

        if (isLate) {
          await supabase.from("incidents").insert({
            worker_id: worker.id,
            owner_id: ownerId,
            incident_type: "late_checkin",
            description: `Checked in at ${currentTimeStr}, scheduled ${workerStartTime}`,
            scanner_id: scanner_id || null,
          });
        }

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

        console.log(`Check-in recorded: ${worker.name}, late: ${isLate}`);
      } else {
        newStatus = "out";
        
        if (currentMinutes < endMinutes) {
          isEarlyCheckout = true;
          await supabase.from("incidents").insert({
            worker_id: worker.id,
            owner_id: ownerId,
            incident_type: "early_checkout",
            description: `Checked out at ${currentTimeStr}, scheduled ${workerEndTime}`,
            scanner_id: scanner_id || null,
          });
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

        console.log(`Check-out recorded: ${worker.name}, early: ${isEarlyCheckout}`);
      }

      return new Response(
        JSON.stringify({
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
    }

    // ========== ROUTE: LEGACY STATIC QR_SECRET ==========
    if (qr_secret) {
      const { data: worker, error: workerError } = await supabase
        .from("workers")
        .select("id, name, is_active, custom_start_time, custom_end_time, owner_id")
        .eq("qr_secret", qr_secret)
        .maybeSingle();

      if (workerError) {
        console.error("Error fetching worker:", workerError);
        return new Response(
          JSON.stringify({ success: false, error: "Database error" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!worker) {
        console.error("Worker not found for qr_secret");
        await supabase.from("incidents").insert({
          incident_type: "invalid_qr",
          description: "Invalid QR secret scanned",
          scanner_id: scanner_id || null,
          worker_id: null,
        });

        return new Response(
          JSON.stringify({ success: false, error: "Invalid QR code", incident_logged: true }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!worker.is_active) {
        await supabase.from("incidents").insert({
          worker_id: worker.id,
          owner_id: worker.owner_id,
          incident_type: "inactive_worker_scan",
          description: "Inactive worker attempted scan",
          scanner_id: scanner_id || null,
        });
        return new Response(
          JSON.stringify({ success: false, error: "Worker is inactive", worker_name: worker.name }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check existing attendance
      const { data: existingAttendance } = await supabase
        .from("attendance")
        .select("*")
        .eq("worker_id", worker.id)
        .eq("date", todayDate)
        .maybeSingle();

      // Get settings
      const { data: settingsData } = await supabase
        .from("settings")
        .select("default_start_time, default_end_time, late_threshold_minutes")
        .eq("owner_id", worker.owner_id)
        .maybeSingle();

      const defaultStartTime = settingsData?.default_start_time || "09:00";
      const defaultEndTime = settingsData?.default_end_time || "17:00";
      const lateThreshold = settingsData?.late_threshold_minutes || 15;
      const workerStartTime = worker.custom_start_time || defaultStartTime;
      const workerEndTime = worker.custom_end_time || defaultEndTime;

      const startMinutes = parseTimeToMinutes(workerStartTime.substring(0, 5));
      const endMinutes = parseTimeToMinutes(workerEndTime.substring(0, 5));

      const nowISO = now.toISOString();
      let action: "check_in" | "check_out";
      let newStatus: "in" | "out" | "late";
      let isLate = false;
      let isEarlyCheckout = false;

      // Determine action based on current state
      if (!existingAttendance || !existingAttendance.check_in) {
        // Check-in
        action = "check_in";
        isLate = currentMinutes > startMinutes + lateThreshold;
        newStatus = isLate ? "late" : "in";

        if (isLate) {
          await supabase.from("incidents").insert({
            worker_id: worker.id,
            owner_id: worker.owner_id,
            incident_type: "late_checkin",
            description: `Checked in at ${currentTimeStr}, scheduled ${workerStartTime}`,
            scanner_id: scanner_id || null,
          });
        }

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
            owner_id: worker.owner_id,
            date: todayDate,
            check_in: nowISO,
            status: newStatus,
            is_late: isLate,
            scanner_id: scanner_id || null,
          });
        }

        console.log(`Legacy check-in: ${worker.name}, late: ${isLate}`);
      } else if (!existingAttendance.check_out) {
        // Check-out
        action = "check_out";
        newStatus = "out";

        if (currentMinutes < endMinutes) {
          isEarlyCheckout = true;
          await supabase.from("incidents").insert({
            worker_id: worker.id,
            owner_id: worker.owner_id,
            incident_type: "early_checkout",
            description: `Checked out at ${currentTimeStr}, scheduled ${workerEndTime}`,
            scanner_id: scanner_id || null,
          });
        }

        await supabase
          .from("attendance")
          .update({
            check_out: nowISO,
            status: newStatus,
            scanner_id: scanner_id || null,
            updated_at: nowISO,
          })
          .eq("id", existingAttendance.id);

        console.log(`Legacy check-out: ${worker.name}, early: ${isEarlyCheckout}`);
      } else {
        // Already checked out
        await supabase.from("incidents").insert({
          worker_id: worker.id,
          owner_id: worker.owner_id,
          incident_type: "double_scan",
          description: "Already checked out today",
          scanner_id: scanner_id || null,
        });

        return new Response(
          JSON.stringify({ 
            success: true,
            action: "already_checked_out",
            message: "You have already checked out today",
            worker_name: worker.name,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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
    }

    return new Response(
      JSON.stringify({ success: false, error: "No valid QR provided" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
