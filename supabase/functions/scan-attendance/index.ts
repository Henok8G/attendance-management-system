import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get qr_secret from request
    const { qr_secret, scanner_id } = await req.json();

    if (!qr_secret) {
      console.error("Missing qr_secret in request");
      return new Response(
        JSON.stringify({ error: "Missing qr_secret" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Processing scan for qr_secret:", qr_secret);

    // Find worker by qr_secret
    const { data: worker, error: workerError } = await supabase
      .from("workers")
      .select("id, name, is_active, custom_start_time")
      .eq("qr_secret", qr_secret)
      .maybeSingle();

    if (workerError) {
      console.error("Error finding worker:", workerError);
      return new Response(
        JSON.stringify({ error: "Database error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!worker) {
      console.error("Worker not found for qr_secret:", qr_secret);
      return new Response(
        JSON.stringify({ error: "Invalid QR code" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!worker.is_active) {
      console.error("Worker is inactive:", worker.id);
      return new Response(
        JSON.stringify({ error: "Worker is inactive", worker_name: worker.name }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Found worker:", worker.name, worker.id);

    // Get today's date in Africa/Addis_Ababa timezone
    const now = new Date();
    const etFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Addis_Ababa",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const todayDate = etFormatter.format(now);

    console.log("Today's date (Africa/Addis_Ababa):", todayDate);

    // Check for existing attendance record
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

    const nowISO = now.toISOString();
    let action: "check_in" | "check_out";
    let newStatus: "in" | "out" | "late";

    // Get settings for late threshold
    const { data: settingsData } = await supabase
      .from("settings")
      .select("default_start_time, late_threshold_minutes")
      .limit(1)
      .maybeSingle();

    const defaultStartTime = settingsData?.default_start_time || "09:00:00";
    const lateThreshold = settingsData?.late_threshold_minutes || 15;
    const workerStartTime = worker.custom_start_time || defaultStartTime;

    // Calculate if late
    const etTimeFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Addis_Ababa",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const currentTimeStr = etTimeFormatter.format(now);
    const [currentHour, currentMinute] = currentTimeStr.split(":").map(Number);
    const currentMinutes = currentHour * 60 + currentMinute;

    const [startHour, startMinute] = workerStartTime.split(":").map(Number);
    const startMinutes = startHour * 60 + startMinute;

    const isLate = currentMinutes > startMinutes + lateThreshold;

    if (existingAttendance) {
      // If already checked in and not checked out, this is a check-out
      if (existingAttendance.check_in && !existingAttendance.check_out) {
        action = "check_out";
        newStatus = "out";

        console.log("Updating check-out for worker:", worker.name);

        const { error: updateError } = await supabase
          .from("attendance")
          .update({
            check_out: nowISO,
            status: newStatus,
            scanner_id: scanner_id || null,
            updated_at: nowISO,
          })
          .eq("id", existingAttendance.id);

        if (updateError) {
          console.error("Error updating attendance:", updateError);
          return new Response(
            JSON.stringify({ error: "Failed to update attendance" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else if (existingAttendance.check_out) {
        // Already checked out - this might be a double scan incident
        console.log("Worker already checked out today:", worker.name);
        
        // Log incident for double scan
        await supabase.from("incidents").insert({
          worker_id: worker.id,
          incident_type: "double_scan",
          description: `Worker ${worker.name} scanned after already checking out`,
          scanner_id: scanner_id || null,
        });

        return new Response(
          JSON.stringify({
            success: true,
            action: "already_checked_out",
            worker_name: worker.name,
            message: "You have already checked out today",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        // Edge case: record exists but no check_in (shouldn't happen normally)
        action = "check_in";
        newStatus = isLate ? "late" : "in";

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
          console.error("Error updating attendance:", updateError);
          return new Response(
            JSON.stringify({ error: "Failed to update attendance" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    } else {
      // No existing record - this is a new check-in
      action = "check_in";
      newStatus = isLate ? "late" : "in";

      console.log("Creating new attendance record for worker:", worker.name, "isLate:", isLate);

      const { error: insertError } = await supabase.from("attendance").insert({
        worker_id: worker.id,
        date: todayDate,
        check_in: nowISO,
        status: newStatus,
        is_late: isLate,
        scanner_id: scanner_id || null,
      });

      if (insertError) {
        console.error("Error inserting attendance:", insertError);
        return new Response(
          JSON.stringify({ error: "Failed to create attendance record" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log("Successfully processed scan - action:", action, "status:", newStatus);

    return new Response(
      JSON.stringify({
        success: true,
        action,
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
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
