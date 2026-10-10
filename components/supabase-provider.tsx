'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-browser'

const SupabaseContext = createContext<ReturnType<typeof createClient> | null>(null)

export function SupabaseProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [supabase] = useState(() => createClient())

  return <SupabaseContext.Provider value={supabase}>{children}</SupabaseContext.Provider>
}

export function useSupabase() {
  const ctx = useContext(SupabaseContext)
  if (!ctx) throw new Error('useSupabase must be used inside SupabaseProvider')
  return ctx
}

export function useUser() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = useSupabase()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [supabase])

  return { user, loading }
}
