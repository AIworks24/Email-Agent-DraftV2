// src/app/api/stats/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = (supabaseUrl && supabaseServiceKey) ? createClient(
  supabaseUrl,
  supabaseServiceKey
) : null;

export async function GET() {
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    // Get basic statistics - simplified for now
    const stats = {
      totalEmails: 0,
      activeClients: 0,
      draftsCreated: 0,
      emailsSent: 0,
      errors: 0,
      processing: 0
    };

    // Try to get real stats if tables exist
    try {
      const { count: totalEmails } = await supabase
        .from('email_logs')
        .select('*', { count: 'exact', head: true });
      
      const { count: activeClients } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      stats.totalEmails = totalEmails || 0;
      stats.activeClients = activeClients || 0;
    } catch (dbError) {
      // Tables might not exist yet, return zeros
      console.log('Database tables not ready yet');
    }

    return NextResponse.json({ stats });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}