import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  // Run SQL via Supabase's postgres REST endpoint
  const sql = `
    ALTER TABLE morning_plans ALTER COLUMN user_id TYPE text USING user_id::text;
  `

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ query: sql })
    })

    // If rpc doesn't exist, try the pg direct endpoint
    if (!res.ok) {
      // Use Supabase's management API (different base URL)
      const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
      if (!projectRef) return NextResponse.json({ error: 'Could not parse project ref' }, { status: 500 })

      const mgmtRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ query: sql })
      })

      const mgmtData = await mgmtRes.json()
      return NextResponse.json({ mgmtStatus: mgmtRes.status, mgmtData })
    }

    const data = await res.json()
    return NextResponse.json({ success: true, data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
