// Fixed: src/app/api/email-logs/route.ts
// Add dynamic export to prevent static generation

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface EmailLog {
  id: string;
  created_at: string;
  subject: string;
  sender_email: string;
  status: string;
  ai_response: string;
  email_accounts?: {
    email_address: string;
    clients?: {
      id: string;
      name: string;
    };
  };
}

export async function GET() {
  try {
    const { data: logs, error } = await supabase
      .from('email_logs')
      .select(`
        *,
        email_accounts (
          email_address,
          clients (
            id,
            name
          )
        )
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Email logs query error:', error);
      return NextResponse.json({ logs: [] });
    }

    const transformedLogs = (logs as any[])?.map((log: any) => ({
      id: log.id,
      created_at: log.created_at,
      subject: log.subject || 'No subject',
      // FIX: Handle both field names for sender email
      sender_email: log.sender_email || log.from_email || 'Unknown sender',
      status: log.status,
      ai_response: log.ai_response,
      client: {
        id: log.email_accounts?.clients?.id,
        name: log.email_accounts?.clients?.name || 'Unknown Client'
      }
    })) || [];

    console.log(`Returning ${transformedLogs.length} email logs`);
    return NextResponse.json({ 
      logs: transformedLogs,
      total: transformedLogs.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Email logs API error:', error);
    return NextResponse.json({ 
      logs: [], 
      error: 'Failed to fetch email logs',
      timestamp: new Date().toISOString()
    });
  }
}