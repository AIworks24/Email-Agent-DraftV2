import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const { data: accounts } = await supabase
    .from('email_accounts')
    .select('email_address, is_active, updated_at, refresh_token');

  const now = Date.now();
  const status = (accounts || []).map(acc => {
    const ageMinutes = (now - new Date(acc.updated_at).getTime()) / 60000;
    let health: 'healthy' | 'warning' | 'critical' | 'dead' = 'healthy';
    
    if (!acc.is_active) health = 'dead';
    else if (ageMinutes > 120) health = 'critical';   // Cron should touch every 20 min
    else if (ageMinutes > 60) health = 'warning';

    return {
      email: acc.email_address,
      is_active: acc.is_active,
      last_refresh: acc.updated_at,
      minutes_since_refresh: Math.round(ageMinutes),
      has_refresh_token: !!acc.refresh_token,
      health
    };
  });

  const anyProblems = status.some(s => s.health !== 'healthy');
  
  return NextResponse.json({
    status: anyProblems ? '🚨 PROBLEMS DETECTED' : '✅ ALL HEALTHY',
    checked_at: new Date().toISOString(),
    accounts: status
  }, { status: anyProblems ? 500 : 200 });
}