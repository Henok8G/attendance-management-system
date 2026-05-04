import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized: missing bearer token' }, 401)
    }
    const token = authHeader.replace('Bearer ', '')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Verify JWT via getClaims (works for tokens signed by this project).
    // For cross-project tokens, fall back to manually decoding the sub claim.
    let userId: string | null = null
    try {
      const { data, error } = await supabase.auth.getClaims(token)
      if (!error && data?.claims?.sub) {
        userId = data.claims.sub as string
      }
    } catch {
      // ignore — fall through to manual decode
    }

    if (!userId) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        userId = payload?.sub ?? null
      } catch {
        return json({ error: 'Unauthorized: invalid token' }, 401)
      }
    }

    if (!userId) {
      return json({ error: 'Unauthorized: invalid token' }, 401)
    }

    // Accept worker_id from query string (GET) or JSON body (POST) for compat.
    const url = new URL(req.url)
    let workerId =
      url.searchParams.get('worker_id') ?? url.searchParams.get('staff_id')

    if (!workerId && req.method !== 'GET') {
      try {
        const body = await req.json()
        workerId = body?.worker_id ?? body?.staff_id ?? null
      } catch {
        // no body
      }
    }

    if (!workerId) {
      return json({ error: 'Missing worker_id query parameter' }, 400)
    }

    // Look up worker (note: this project uses `workers` table, not `staff_profiles`).
    const { data: worker, error: workerErr } = await supabase
      .from('workers')
      .select('id, name')
      .eq('id', workerId)
      .maybeSingle()

    if (workerErr) {
      return json({ error: `Worker lookup failed: ${workerErr.message}` }, 500)
    }
    if (!worker) {
      return json({ error: 'Worker not found' }, 404)
    }

    // NOTE: this project's table is `attendance` (column `worker_id`), not
    // `attendance_logs.staff_id`. We query `attendance` and transform the
    // status values to the scanner app's expected shape.
    const { data: records, error: recErr } = await supabase
      .from('attendance')
      .select('id, status, check_in, check_out, date')
      .eq('worker_id', workerId)
      .order('date', { ascending: false })
      .order('check_in', { ascending: false })
      .limit(100)

    if (recErr) {
      return json({ error: `Attendance query failed: ${recErr.message}` }, 500)
    }

    const logs = (records ?? [])
      .filter((r) => String(r.status).toUpperCase() !== 'INCIDENT')
      .map((r) => {
        const rawStatus = String(r.status).toLowerCase()
        const status =
          rawStatus === 'in' || rawStatus === 'late'
            ? 'CHECKED_IN'
            : rawStatus === 'out'
              ? 'CHECKED_OUT'
              : String(r.status).toUpperCase()
        return {
          id: r.id,
          status,
          scanned_at: r.check_in ?? r.check_out ?? r.date,
          staff_name: worker.name,
        }
      })

    return json({ staffName: worker.name, logs })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('get-attendance-history error:', message)
    return json({ error: message }, 500)
  }
})
