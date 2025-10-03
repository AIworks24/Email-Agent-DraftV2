// PRODUCTION: src/app/api/auth/login/route.ts
// Clean version without debug logging

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    // Check password against environment variable
    const correctPassword = process.env.DASHBOARD_PASSWORD;

    if (!correctPassword) {
      console.error('❌ DASHBOARD_PASSWORD not set in environment variables');
      return NextResponse.json(
        { error: 'Authentication not configured' },
        { status: 500 }
      );
    }

    if (password === correctPassword) {
      // Password correct - set authentication cookie
      const response = NextResponse.json({ success: true });
      
      // Get auth token from environment
      const authToken = process.env.DASHBOARD_AUTH_TOKEN;
      
      if (!authToken) {
        console.error('❌ DASHBOARD_AUTH_TOKEN not set in environment variables');
        return NextResponse.json(
          { error: 'Authentication not configured' },
          { status: 500 }
        );
      }
      
      // Set httpOnly cookie (more secure than localStorage)
      response.cookies.set('dashboard_auth', authToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/'
      });

      console.log('✅ Dashboard login successful');
      return response;
    } else {
      // Password incorrect
      console.log('⚠️ Dashboard login failed - incorrect password attempt');
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('❌ Login error:', error);
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}

// Logout endpoint
export async function DELETE(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  
  // Clear the authentication cookie
  response.cookies.delete('dashboard_auth');
  
  console.log('✅ Dashboard logout successful');
  return response;
}