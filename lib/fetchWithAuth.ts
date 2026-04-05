/**
 * Authenticated fetch helper for client-side API calls.
 * Automatically attaches the Supabase access token as a Bearer token.
 */
import { supabase } from '@/lib/supabase/client'

export async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  const headers = new Headers(options.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  return fetch(url, { ...options, headers })
}
