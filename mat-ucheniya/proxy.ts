import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

/**
 * Auth proxy (Next.js 16 file convention; renamed from middleware):
 * - Refreshes the Supabase session cookie on every matched request.
 * - Redirects unauthenticated users on /c/* to /login.
 * - Redirects users with must_change_password to /onboarding
 *   (from /c/* and from /).
 * - Redirects authenticated users on /login to / (no point in showing
 *   the login form to someone already in).
 */
export async function proxy(request: NextRequest) {
  const { response, user, supabase } = await updateSession(request)
  const { pathname } = request.nextUrl

  const isProtectedArea = pathname.startsWith('/c/')
  const isLoginPage = pathname === '/login'
  const isOnboarding = pathname === '/onboarding'
  const isAuthCallback = pathname.startsWith('/auth/')

  // Unauthenticated: block protected areas.
  if (!user) {
    if (isProtectedArea) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    return response
  }

  // Authenticated: check must_change_password.
  // Skip this check on the onboarding page and on auth callback routes.
  if (!isOnboarding && !isAuthCallback) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('must_change_password')
      .eq('user_id', user.id)
      .single()

    if (profile?.must_change_password) {
      const url = request.nextUrl.clone()
      url.pathname = '/onboarding'
      return NextResponse.redirect(url)
    }
  }

  // Authenticated user on the login page → bounce home.
  if (isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all routes except:
     * - _next/static, _next/image (framework internals)
     * - favicon, public assets
     * - /api (server-only; those routes check auth themselves)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
