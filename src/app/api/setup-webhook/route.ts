// Create: src/app/api/setup-webhook/route.ts
// Manual webhook subscription setup with token refresh

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GraphService } from '@/lib/microsoftGraph';
import { getValidAccessToken } from '@/lib/tokenRefresh';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { clientId } = await request.json();

    // Get client's email account
    const { data: emailAccount, error } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('client_id', clientId)
      .eq('is_active', true)
      .single();

    if (error || !emailAccount) {
      return NextResponse.json(
        { error: 'No active email account found for client' },
        { status: 404 }
      );
    }

    // Get a valid access token (will refresh if needed)
    let accessToken;
    try {
      accessToken = await getValidAccessToken(emailAccount.id);
    } catch (tokenError) {
      return NextResponse.json(
        { 
          error: 'Token refresh failed',
          message: 'Client needs to re-authenticate. Please remove and re-add the client.',
          details: tokenError instanceof Error ? tokenError.message : 'Unknown token error'
        },
        { status: 401 }
      );
    }

    // Create webhook subscription with fresh token
    const graphService = new GraphService(accessToken);
    const webhookUrl = `${process.env.WEBHOOK_BASE_URL}/api/webhooks/email-received`;
    const clientState = `email-agent-${emailAccount.email_address}-${Date.now()}`;

    const subscription = await graphService.subscribeToEmails(webhookUrl, clientState);

    // Save subscription to database
    const { data: webhookSub, error: subError } = await supabase
      .from('webhook_subscriptions')
      .insert({
        email_account_id: emailAccount.id,
        subscription_id: subscription.id,
        webhook_url: webhookUrl,
        client_state: clientState,
        expires_at: subscription.expirationDateTime,
        is_active: true
      })
      .select()
      .single();

    if (subError) {
      console.error('Failed to save subscription:', subError);
    }

    return NextResponse.json({
      message: 'Webhook subscription created successfully',
      subscription: subscription,
      webhookUrl: webhookUrl,
      expiresAt: subscription.expirationDateTime
    });

  } catch (error) {
    console.error('Webhook setup error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to setup webhook',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}