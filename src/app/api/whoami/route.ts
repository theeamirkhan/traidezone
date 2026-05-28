/**
 * /api/whoami — returns the current Clerk user_id
 *
 * Used for diagnosing user_id mismatches between hardcoded admin
 * constants and actual session IDs.
 */

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

export async function GET() {
  const { userId, sessionId } = await auth()
  return NextResponse.json({
    userId: userId || null,
    sessionId: sessionId || null,
    isLoggedIn: !!userId,
  })
}
