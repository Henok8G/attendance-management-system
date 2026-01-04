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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    // Use service role to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get worker_id from request body or query params
    const url = new URL(req.url);
    let workerId = url.searchParams.get('worker_id');
    
    if (!workerId && req.method === 'POST') {
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

    // Fetch attendance records from BarberFlow's attendance table
    const { data: logs, error: logsError } = await supabase
      .from('attendance')
      .select('id, status, check_in, check_out, date, is_late, notes')
      .eq('worker_id', workerId)
      .order('date', { ascending: false })
      .order('check_in', { ascending: false })
      .limit(50)

    if (logsError) {
      console.error('Error fetching logs:', logsError);
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
      is_late: log.is_late,
      notes: log.notes
    })) || [];

    console.log(`Found ${transformedLogs.length} attendance records`);

    return new Response(JSON.stringify({ logs: transformedLogs }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
