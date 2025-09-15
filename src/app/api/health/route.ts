import { NextResponse } from 'next/server';

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