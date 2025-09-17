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
      return NextResponse.json({ logs: [] });
    }

    const transformedLogs = (logs as EmailLog[])?.map((log: EmailLog) => ({
      id: log.id,
      created_at: log.created_at,
      subject: log.subject,
      sender_email: log.sender_email,
      status: log.status,
      ai_response: log.ai_response,
      client: log.email_accounts?.clients
    })) || [];

    return NextResponse.json({ logs: transformedLogs });
  } catch (error) {
    return NextResponse.json({ logs: [] });
  }
}