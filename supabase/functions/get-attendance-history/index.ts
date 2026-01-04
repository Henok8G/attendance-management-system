import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  console.log('Get attendance history function invoked');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Use service role to bypass RLS for fetching worker data
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    // Get worker_id from request body
    let workerId = null;
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        workerId = body.worker_id || body.staff_id;
      } catch {
        // No body provided
      }
    }

    if (!workerId) {
      return new Response(JSON.stringify({ error: 'Missing worker_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Fetching attendance history for worker: ${workerId}`);

    // Get worker profile for name (adapted from staff_profiles)
    const { data: worker } = await supabaseAdmin
      .from('workers')
      .select('name')
      .eq('id', workerId)
      .maybeSingle()

    // Get attendance logs (adapted from attendance_logs to attendance)
    const { data: logs, error: logsError } = await supabaseAdmin
      .from('attendance')
      .select('id, status, check_in, check_out, date, is_late')
      .eq('worker_id', workerId)
      .order('date', { ascending: false })
      .order('check_in', { ascending: false })
      .limit(50)

    if (logsError) {
      console.error('Error fetching logs:', logsError)
      return new Response(JSON.stringify({ error: 'Failed to fetch history' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Transform to match expected format for Staff Scan Hub
    const transformedLogs = logs?.map(log => ({
      id: log.id,
      status: log.status === 'in' ? 'CHECKED_IN' : log.status === 'out' ? 'CHECKED_OUT' : log.status.toUpperCase(),
      scanned_at: log.check_in || log.check_out || log.date,
      check_in: log.check_in,
      check_out: log.check_out,
      date: log.date,
      is_late: log.is_late
    })).filter(log => log.status !== 'INCIDENT') || [];

    console.log(`Found ${transformedLogs.length} attendance records for ${worker?.name || 'Unknown'}`);

    return new Response(JSON.stringify({ 
      logs: transformedLogs,
      staffName: worker?.name || 'Unknown'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
