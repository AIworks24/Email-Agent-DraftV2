// Fixed: src/app/api/env-status/route.ts
// Add dynamic export to prevent static generation

import { NextResponse } from 'next/server';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const envStatus = {
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      MICROSOFT_CLIENT_ID: !!process.env.MICROSOFT_CLIENT_ID,
      MICROSOFT_CLIENT_SECRET: !!process.env.MICROSOFT_CLIENT_SECRET,
      MICROSOFT_TENANT_ID: !!process.env.MICROSOFT_TENANT_ID,
      WEBHOOK_BASE_URL: !!process.env.WEBHOOK_BASE_URL
    };

    return NextResponse.json({ envStatus });
  } catch (error) {
    console.error('Error checking environment status:', error);
    return NextResponse.json({ error: 'Failed to check environment status' }, { status: 500 });
  }
}