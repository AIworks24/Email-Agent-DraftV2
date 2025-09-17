// Fixed: src/app/api/emails/route.ts
// Add dynamic export to prevent static generation

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// This tells Next.js that this route uses dynamic features and should not be statically generated
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = (supabaseUrl && supabaseServiceKey) ? createClient(
  supabaseUrl,
  supabaseServiceKey
) : null;

// GET /api/emails - List all processed emails
export async function GET(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');

    let query = supabase
      .from('email_logs')
      .select(`
        *,
        email_accounts (
          email_address,
          clients (
            name
          )
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (clientId) {
      query = query.eq('email_accounts.client_id', clientId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data: emails, error } = await query;

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to fetch emails' }, { status: 500 });
    }

    return NextResponse.json({ emails });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}