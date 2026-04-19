'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function changePasswordAction(
  _prev: { error: string | null; success: boolean },
  formData: FormData,
): Promise<{ error: string | null; success: boolean }> {
  const currentPassword = String(formData.get('current_password') ?? '')
  const newPassword = String(formData.get('new_password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  if (!currentPassword) {
    return { error: 'Введите текущий пароль', success: false }
  }
  if (!newPassword || newPassword.length < 8) {
    return { error: 'Новый пароль должен быть не короче 8 символов', success: false }
  }
  if (newPassword !== confirm) {
    return { error: 'Пароли не совпадают', success: false }
  }
  if (newPassword === currentPassword) {
    return { error: 'Новый пароль должен отличаться от текущего', success: false }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !user.email) {
    redirect('/login')
  }

  // Re-verify the current password by signing in again. Supabase doesn't
  // expose a "verify password" API, so this is the idiomatic approach.
  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })
  if (verifyErr) {
    return { error: 'Текущий пароль неверен', success: false }
  }

  // Now update to the new password.
  const { error: updErr } = await supabase.auth.updateUser({ password: newPassword })
  if (updErr) {
    return { error: 'Не удалось сменить пароль: ' + updErr.message, success: false }
  }

  return { error: null, success: true }
}
