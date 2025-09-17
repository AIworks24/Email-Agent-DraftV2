// Fixed: src/app/api/stats/route.ts
// Add dynamic export to prevent static generation

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

const supabase = (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) 
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    ) 
  : null;

export async function GET() {
  if (!supabase) {
    return NextResponse.json({ 
      error: 'Database not configured',
      message: 'Environment variables not set' 
    }, { status: 503 });
  }

  try {
    // Get clients count
    const { count: clientsCount } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true });

    // Get email logs stats  
    const { count: totalEmails } = await supabase
      .from('email_logs')
      .select('*', { count: 'exact', head: true });

    const { count: draftsCreated } = await supabase
      .from('email_logs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'draft_created');

    const stats = {
      totalEmails: totalEmails || 0,
      draftsCreated: draftsCreated || 0,
      emailsSent: 0, // Add your logic here
      activeClients: clientsCount || 0
    };

    return NextResponse.json({ stats });
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}