import { createClient } from '@supabase/supabase-js'

const isProd = process.env.NODE_ENV === 'production'

// localStorage(기존 호환) + 쿠키(middleware용) 동시 저장
const hybridStorage = {
  getItem: (k: string) => (typeof window === 'undefined' ? null : localStorage.getItem(k)),
  setItem: (k: string, v: string) => {
    if (typeof window === 'undefined') return
    localStorage.setItem(k, v)
    const secure = isProd ? ';Secure' : ''
    document.cookie = `${k}=${encodeURIComponent(v)};path=/;Max-Age=604800;SameSite=Lax${secure}`
  },
  removeItem: (k: string) => {
    if (typeof window === 'undefined') return
    localStorage.removeItem(k)
    document.cookie = `${k}=;path=/;Max-Age=0`
  },
}

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
  {
    auth: {
      storage: hybridStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
