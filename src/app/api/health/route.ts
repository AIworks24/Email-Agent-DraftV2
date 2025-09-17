// Fixed: src/app/api/health/route.ts
// Add dynamic export to prevent static generation

import { NextResponse } from 'next/server';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV 
  });
}

export async function POST() {
  return NextResponse.json({ 
    status: 'OK', 
    method: 'POST',
    timestamp: new Date().toISOString()
  });
}