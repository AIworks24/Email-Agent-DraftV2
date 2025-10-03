// CREATE NEW FILE: src/middleware.ts
// Simple password protection that doesn't break OAuth flow

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // ✅ CRITICAL: Allow OAuth callback URLs to pass through WITHOUT authentication
  // This ensures Microsoft OAuth redirects work correctly
  const publicPaths = [
    '/api/auth/signin',
    '/api/auth/callback',
    '/api/webhooks/email-received',
    '/api/webhooks/email-deleted',
    '/api/setup-webhook',
    '/api/health',
    '/login'  // Login page itself must be accessible
  ];
  
  // Check if this is a public API endpoint
  const isPublicPath = publicPaths.some(path => pathname.startsWith(path));
  
  if (isPublicPath) {
    // Allow API endpoints to pass through
    return NextResponse.next();
  }
  
  // For all other routes (dashboard, etc.), check authentication
  const authCookie = request.cookies.get('dashboard_auth');
  
  // Check if user is authenticated
  if (authCookie?.value === process.env.DASHBOARD_AUTH_TOKEN) {
    // User is authenticated, allow access
    return NextResponse.next();
  }
  
  // User is NOT authenticated
  // If trying to access dashboard, redirect to login
  if (pathname === '/' || pathname.startsWith('/dashboard')) {
    // Redirect to login page with return URL
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('returnUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }
  
  // For other protected routes, return 401
  return NextResponse.json(
    { error: 'Unauthorized' },
    { status: 401 }
  );
}

// Configure which paths this middleware runs on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files (svg, png, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$|.*\\.jpg$).*)',
  ],
};