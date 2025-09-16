// Create: src/app/api/setup-webhook/route.ts
// Manual webhook subscription setup

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GraphService } from '@/lib/microsoftGraph';

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

    // Create webhook subscription
    const graphService = new GraphService(emailAccount.access_token);
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
      webhookUrl: webhookUrl
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