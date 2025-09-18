// Create: src/app/api/debug-subscriptions/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GraphService } from '@/lib/microsoftGraph';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    // Get first active email account
    const { data: emailAccount } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('is_active', true)
      .single();

    if (!emailAccount) {
      return NextResponse.json({ error: 'No active email account found' }, { status: 404 });
    }

    // Get valid token and create Graph service
    const { getValidAccessToken } = await import('@/lib/tokenRefresh');
    const validToken = await getValidAccessToken(emailAccount.id);
    const graphService = new GraphService(validToken);

    // List all subscriptions
    const subscriptions = await graphService.listAllSubscriptions();

    return NextResponse.json({
      message: 'Current webhook subscriptions',
      subscriptions,
      count: subscriptions.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Debug subscriptions error:', error);
    return NextResponse.json({
      error: 'Failed to list subscriptions',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();

    // Get first active email account
    const { data: emailAccount } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('is_active', true)
      .single();

    if (!emailAccount) {
      return NextResponse.json({ error: 'No active email account found' }, { status: 404 });
    }

    // Get valid token and create Graph service
    const { getValidAccessToken } = await import('@/lib/tokenRefresh');
    const validToken = await getValidAccessToken(emailAccount.id);
    const graphService = new GraphService(validToken);

    if (action === 'cleanup') {
      await graphService.cleanupOldSubscriptions();
      const remainingSubscriptions = await graphService.listAllSubscriptions();

      return NextResponse.json({
        message: 'Subscription cleanup completed',
        remainingSubscriptions,
        count: remainingSubscriptions.length,
        timestamp: new Date().toISOString()
      });
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error) {
    console.error('Debug subscriptions action error:', error);
    return NextResponse.json({
      error: 'Failed to perform action',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}