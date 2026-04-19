'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loginToEmail } from '@/lib/auth'

export async function signInAction(
  _prev: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  const login = String(formData.get('login') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')

  if (!login || !password) {
    return { error: 'Логин и пароль обязательны' }
  }

  if (!/^[a-z0-9_-]{3,32}$/.test(login)) {
    return { error: 'Неверный логин или пароль' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: loginToEmail(login),
    password,
  })

  if (error) {
    // Don't leak which one is wrong.
    return { error: 'Неверный логин или пароль' }
  }

  redirect('/')
}
