// FIXED: src/middleware.ts
// Added /api/auth/login to publicPaths

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // ✅ CRITICAL: Allow these paths WITHOUT authentication
  const publicPaths = [
    '/api/auth/signin',           // OAuth start
    '/api/auth/callback',         // OAuth callback
    '/api/auth/login',            // ← FIX: Login endpoint MUST be public!
    '/api/webhooks/email-received', // Email webhook
    '/api/webhooks/email-deleted',  // Delete webhook
    '/api/setup-webhook',         // Webhook renewal
    '/api/health',                // Health check
    '/login'                      // Login page
  ];
  
  // Check if this is a public path
  const isPublicPath = publicPaths.some(path => pathname.startsWith(path));
  
  if (isPublicPath) {
    // Allow request to pass through without auth check
    return NextResponse.next();
  }
  
  // For all other routes, check authentication
  const authCookie = request.cookies.get('dashboard_auth');
  
  // Check if user is authenticated
  if (authCookie?.value === process.env.DASHBOARD_AUTH_TOKEN) {
    // User is authenticated, allow access
    return NextResponse.next();
  }
  
  // User is NOT authenticated
  // If trying to access dashboard, redirect to login
  if (pathname === '/' || pathname.startsWith('/dashboard')) {
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
    '/((?!_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$|.*\\.jpg$).*)',
  ],
};