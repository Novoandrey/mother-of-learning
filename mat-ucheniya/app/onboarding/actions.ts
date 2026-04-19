'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function changePasswordOnboardingAction(
  _prev: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  const newPassword = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  if (!newPassword || newPassword.length < 8) {
    return { error: 'Пароль должен быть не короче 8 символов' }
  }
  if (newPassword !== confirm) {
    return { error: 'Пароли не совпадают' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Сессия истекла. Войдите заново.' }
  }

  // Update password in auth.users.
  const { error: pwErr } = await supabase.auth.updateUser({ password: newPassword })
  if (pwErr) {
    // Most common failure: password is the same as the current one.
    if (pwErr.message.toLowerCase().includes('same')) {
      return { error: 'Новый пароль должен отличаться от начального' }
    }
    return { error: 'Не удалось сменить пароль: ' + pwErr.message }
  }

  // Clear the flag.
  const { error: profileErr } = await supabase
    .from('user_profiles')
    .update({ must_change_password: false })
    .eq('user_id', user.id)

  if (profileErr) {
    return { error: 'Пароль сменён, но профиль не обновился. Напишите ДМу.' }
  }

  redirect('/')
}
