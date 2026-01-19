import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Decode JWT to get user ID (cross-project call, can't verify)
    const token = authHeader.replace("Bearer ", "");
    const payloadBase64 = token.split(".")[1];
    const payload = JSON.parse(atob(payloadBase64));
    const userId = payload.sub;

    if (!userId) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get worker_id from request body
    let workerId = null;
    try {
      const body = await req.json();
      workerId = body.worker_id || body.staff_id;
    } catch {
      // No body or invalid JSON
    }

    if (!workerId) {
      return new Response(JSON.stringify({ error: "Missing worker_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get worker name (equivalent to staff_profiles)
    const { data: profile } = await supabase
      .from("workers")
      .select("name")
      .eq("id", workerId)
      .maybeSingle();

    // Get attendance logs (from attendance table, transform to match expected format)
    const { data: attendanceRecords, error } = await supabase
      .from("attendance")
      .select("id, status, check_in, check_out, date")
      .eq("worker_id", workerId)
      .order("date", { ascending: false })
      .order("check_in", { ascending: false })
      .limit(50);

    if (error) throw error;

    // Transform to match Staff Scan Hub expected format (attendance_logs format)
    const logs = (attendanceRecords || [])
      .filter(record => record.status !== "incident")
      .map(record => ({
        id: record.id,
        status: record.status === "in" ? "CHECKED_IN" : record.status === "out" ? "CHECKED_OUT" : record.status.toUpperCase(),
        scanned_at: record.check_in || record.check_out || record.date,
      }));

    return new Response(
      JSON.stringify({ logs, staffName: profile?.name || "Staff" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
