import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { refreshAccessToken } from '@/lib/tokenRefresh';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');

  if (!email) {
    return NextResponse.json({ error: 'Missing ?email= parameter' }, { status: 400 });
  }

  console.log('🔧 DEBUG: Force refresh requested for', email);

  const { data: account, error } = await supabase
    .from('email_accounts')
    .select('id, email_address, is_active')
    .eq('email_address', email)
    .single();

  if (error || !account) {
    return NextResponse.json({ error: 'Account not found', email }, { status: 404 });
  }

  if (!account.is_active) {
    return NextResponse.json({ 
      error: 'Account is inactive - needs re-authentication first',
      email 
    }, { status: 400 });
  }

  try {
    const newToken = await refreshAccessToken(account.id);
    return NextResponse.json({
      success: true,
      email: account.email_address,
      access_token_length: newToken.length,
      message: 'Check Vercel logs for detailed refresh diagnostic output'
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      message: 'Check Vercel logs for details'
    }, { status: 500 });
  }
}