import type { Metadata } from 'next'
import '@fontsource-variable/manrope'
import '@fontsource-variable/jetbrains-mono'
import './globals.css'
import { APP_NAME, APP_DESCRIPTION } from '@/lib/branding'
import { ToastProvider } from '@/components/toast-provider'

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-gray-50 text-gray-900 antialiased font-sans">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
