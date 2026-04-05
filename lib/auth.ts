/**
 * Server-side auth helpers for API routes.
 * Verifies the Supabase session from the Authorization header.
 */
import { createClient } from '@supabase/supabase-js'

/**
 * Extract and verify the user from a Supabase access token in the
 * Authorization header (Bearer <token>).
 *
 * Returns { userId, error }. If error is set, the request should be rejected.
 */
export async function verifySession(req: Request): Promise<{ userId: string | null; error: string | null }> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { userId: null, error: 'Missing authorization header' }
  }

  const token = authHeader.slice(7)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
  )

  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    return { userId: null, error: 'Invalid or expired token' }
  }

  return { userId: user.id, error: null }
}
