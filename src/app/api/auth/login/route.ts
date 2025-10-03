// DEBUGGING VERSION: src/app/api/auth/login/route.ts
// This version will help us see what's happening

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    // Get environment variables
    const correctPassword = process.env.DASHBOARD_PASSWORD;
    const authToken = process.env.DASHBOARD_AUTH_TOKEN;

    // 🔍 DEBUG LOGGING (we'll remove this after fixing)
    console.log('🔍 DEBUG LOGIN ATTEMPT:');
    console.log('  - Password received length:', password?.length);
    console.log('  - Password received (first 3 chars):', password?.substring(0, 3) + '***');
    console.log('  - DASHBOARD_PASSWORD is set:', !!correctPassword);
    console.log('  - DASHBOARD_PASSWORD length:', correctPassword?.length);
    console.log('  - DASHBOARD_PASSWORD (first 3 chars):', correctPassword?.substring(0, 3) + '***');
    console.log('  - DASHBOARD_AUTH_TOKEN is set:', !!authToken);
    console.log('  - Passwords match:', password === correctPassword);
    
    // Additional checks
    console.log('  - Has leading/trailing spaces (input):', password !== password?.trim());
    console.log('  - Has leading/trailing spaces (env):', correctPassword !== correctPassword?.trim());

    if (!correctPassword) {
      console.error('❌ DASHBOARD_PASSWORD not set in environment variables');
      return NextResponse.json(
        { error: 'Authentication not configured - DASHBOARD_PASSWORD missing' },
        { status: 500 }
      );
    }

    if (!authToken) {
      console.error('❌ DASHBOARD_AUTH_TOKEN not set in environment variables');
      return NextResponse.json(
        { error: 'Authentication not configured - DASHBOARD_AUTH_TOKEN missing' },
        { status: 500 }
      );
    }

    // Try exact match first
    if (password === correctPassword) {
      const response = NextResponse.json({ success: true });
      
      response.cookies.set('dashboard_auth', authToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/'
      });

      console.log('✅ Dashboard login successful (exact match)');
      return response;
    }
    
    // Try trimmed match (in case of spaces)
    if (password?.trim() === correctPassword?.trim()) {
      const response = NextResponse.json({ success: true });
      
      response.cookies.set('dashboard_auth', authToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
        path: '/'
      });

      console.log('✅ Dashboard login successful (trimmed match)');
      return response;
    }

    // If we get here, password is wrong
    console.log('❌ Dashboard login failed - incorrect password');
    console.log('  - Input:', `"${password}"`);
    console.log('  - Expected:', `"${correctPassword}"`);
    
    return NextResponse.json(
      { error: 'Invalid password' },
      { status: 401 }
    );
  } catch (error) {
    console.error('❌ Login error:', error);
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('dashboard_auth');
  console.log('✅ Dashboard logout successful');
  return response;
}