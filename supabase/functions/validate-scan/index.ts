import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  console.log('Validate scan function invoked');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Use service role client to bypass RLS for validation
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    let body: { qr_session_id?: string; qr_token?: string };
    try {
      body = await req.json();
    } catch {
      console.error("Invalid JSON body");
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Accept either qr_session_id (Staff Scan Hub format) or qr_token (BarberFlow format)
    const qrToken = body.qr_session_id || body.qr_token;
    
    if (!qrToken || typeof qrToken !== 'string' || qrToken.length < 32) {
      console.error("Invalid QR code provided");
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid QR code' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Validating QR token: ${qrToken.substring(0, 8)}...`);

    const now = new Date();
    const todayDate = getEthiopiaDate();
    const currentTimeStr = getEthiopiaTimeStr(now);
    const currentMinutes = parseTimeToMinutes(currentTimeStr);

    // ========== QR TOKEN LOOKUP ==========
    const { data: qrRecord, error: qrError } = await supabase
      .from("daily_qr_codes")
      .select("*, workers(id, name, is_active, custom_start_time, custom_end_time, owner_id)")
      .eq("qr_token", qrToken)
      .maybeSingle();

    if (qrError) {
      console.error("Error fetching QR record:", qrError);
      return new Response(
        JSON.stringify({ success: false, error: "Database error" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // QR token not found - log incident and return success (as per Staff Scan Hub spec)
    if (!qrRecord) {
      console.log('QR token not found - logging incident');
      await supabase.from("incidents").insert({
        incident_type: "invalid_qr",
        description: "Invalid QR token scanned via external scanner",
        worker_id: null,
        owner_id: null,
      });
      
      return new Response(
        JSON.stringify({ success: true, timestamp: new Date().toISOString(), status: 'INCIDENT' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    let isIncident = false;
    let status = '';

    // ========== VALIDATIONS ==========
    
    // Check if worker is active
    if (!worker.is_active) {
      console.log(`Worker ${worker.name} is inactive`);
      isIncident = true;
      await supabase.from("incidents").insert({
        worker_id: worker.id,
        owner_id: ownerId,
        incident_type: "inactive_worker_scan",
        description: `Inactive worker attempted scan`,
      });
    }

    // Check if QR is for today
    if (!isIncident && qrRecord.date !== todayDate) {
      console.log(`QR date mismatch: QR=${qrRecord.date}, today=${todayDate}`);
      isIncident = true;
      await supabase.from("incidents").insert({
        worker_id: worker.id,
        owner_id: ownerId,
        incident_type: "expired_qr",
        description: `Used QR from ${qrRecord.date} on ${todayDate}`,
      });
    }

    // Check time window validity
    const validFrom = new Date(qrRecord.valid_from);
    const validUntil = new Date(qrRecord.valid_until);

    if (!isIncident && (now < validFrom || now > validUntil)) {
      console.log(`QR outside valid time window`);
      isIncident = true;
      await supabase.from("incidents").insert({
        worker_id: worker.id,
        owner_id: ownerId,
        incident_type: now < validFrom ? "early_scan" : "expired_qr",
        description: `Scanned ${qrType} QR outside valid time (${validFrom.toISOString()} - ${validUntil.toISOString()})`,
      });
    }

    // Check if already used
    if (!isIncident && qrRecord.used_at) {
      console.log(`QR already used at: ${qrRecord.used_at}`);
      isIncident = true;
      await supabase.from("incidents").insert({
        worker_id: worker.id,
        owner_id: ownerId,
        incident_type: "double_scan",
        description: `Attempted to reuse ${qrType} QR (used at ${qrRecord.used_at})`,
      });
    }

    if (!isIncident) {
      // Get existing attendance
      const { data: existingAttendance } = await supabase
        .from("attendance")
        .select("*")
        .eq("worker_id", worker.id)
        .eq("date", todayDate)
        .maybeSingle();

      // Validate logical flow
      if (qrType === "check_in") {
        if (existingAttendance?.check_in) {
          isIncident = true;
          await supabase.from("incidents").insert({
            worker_id: worker.id,
            owner_id: ownerId,
            incident_type: "double_scan",
            description: `Attempted check-in but already checked in at ${existingAttendance.check_in}`,
          });
        } else {
          status = 'CHECKED_IN';
        }
      } else if (qrType === "check_out") {
        if (!existingAttendance?.check_in) {
          isIncident = true;
          await supabase.from("incidents").insert({
            worker_id: worker.id,
            owner_id: ownerId,
            incident_type: "wrong_qr_type",
            description: `Attempted check-out without checking in first`,
          });
        } else if (existingAttendance?.check_out) {
          isIncident = true;
          await supabase.from("incidents").insert({
            worker_id: worker.id,
            owner_id: ownerId,
            incident_type: "double_scan",
            description: `Attempted check-out but already checked out at ${existingAttendance.check_out}`,
          });
        } else {
          status = 'CHECKED_OUT';
        }
      }
    }

    const finalStatus = isIncident ? 'INCIDENT' : status;
    console.log(`Recording attendance: ${finalStatus}`);

    // Only process attendance if not an incident
    if (!isIncident) {
      // Mark QR as used
      const { error: updateQrError, data: updatedQr } = await supabase
        .from("daily_qr_codes")
        .update({ used_at: now.toISOString() })
        .eq("id", qrRecord.id)
        .is("used_at", null)
        .select()
        .maybeSingle();

      if (updateQrError || !updatedQr) {
        console.error("Failed to mark QR as used or race condition");
        return new Response(
          JSON.stringify({ success: true, timestamp: new Date().toISOString(), status: 'INCIDENT' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get settings for late threshold
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

      if (qrType === "check_in") {
        const isLate = currentMinutes > startMinutes + lateThreshold;
        const newStatus = isLate ? "late" : "in";

        if (isLate) {
          await supabase.from("incidents").insert({
            worker_id: worker.id,
            owner_id: ownerId,
            incident_type: "late_checkin",
            description: `Checked in at ${currentTimeStr}, scheduled start was ${workerStartTime} (${lateThreshold}min threshold)`,
          });
        }

        // Get existing attendance to decide insert vs update
        const { data: existingAtt } = await supabase
          .from("attendance")
          .select("id")
          .eq("worker_id", worker.id)
          .eq("date", todayDate)
          .maybeSingle();

        if (existingAtt) {
          await supabase
            .from("attendance")
            .update({
              check_in: nowISO,
              status: newStatus,
              is_late: isLate,
              updated_at: nowISO,
            })
            .eq("id", existingAtt.id);
        } else {
          await supabase.from("attendance").insert({
            worker_id: worker.id,
            owner_id: ownerId,
            date: todayDate,
            check_in: nowISO,
            status: newStatus,
            is_late: isLate,
          });
        }

        console.log(`Check-in recorded for ${worker.name}, isLate: ${isLate}`);
      } else {
        // Check-out
        const { data: existingAtt } = await supabase
          .from("attendance")
          .select("id")
          .eq("worker_id", worker.id)
          .eq("date", todayDate)
          .maybeSingle();

        if (currentMinutes < endMinutes) {
          await supabase.from("incidents").insert({
            worker_id: worker.id,
            owner_id: ownerId,
            incident_type: "early_checkout",
            description: `Checked out at ${currentTimeStr}, scheduled end was ${workerEndTime}`,
          });
        }

        if (existingAtt) {
          await supabase
            .from("attendance")
            .update({
              check_out: nowISO,
              status: "out",
              updated_at: nowISO,
            })
            .eq("id", existingAtt.id);
        }

        console.log(`Check-out recorded for ${worker.name}`);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        timestamp: new Date().toISOString(),
        status: finalStatus,
        worker_name: worker.name,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: true, timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
