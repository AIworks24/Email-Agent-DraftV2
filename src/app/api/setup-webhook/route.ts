// Enhanced: src/app/api/setup-webhook/route.ts
// Automatic webhook subscription setup with self-renewal capability

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

    // Check if there's already an active subscription
    const { data: existingSubscription } = await supabase
      .from('webhook_subscriptions')
      .select('*')
      .eq('email_account_id', emailAccount.id)
      .eq('is_active', true)
      .single();

    // If subscription exists and still valid (more than 10 minutes remaining), return it
    if (existingSubscription) {
      const expiresAt = new Date(existingSubscription.expires_at);
      const tenMinsFromNow = new Date(Date.now() + 10 * 60 * 1000);
      
      if (expiresAt > tenMinsFromNow) {
        return NextResponse.json({
          message: 'Webhook subscription already active',
          subscription: { id: existingSubscription.subscription_id },
          expiresAt: existingSubscription.expires_at,
          status: 'existing'
        });
      }
      
      // Existing subscription is expiring soon, try to renew it
      try {
        const validToken = await getValidAccessToken(emailAccount.id);
        const graphService = new GraphService(validToken);
        
        const renewedSub = await graphService.renewSubscription(existingSubscription.subscription_id);
        
        // Update database with new expiration
        await supabase
          .from('webhook_subscriptions')
          .update({
            expires_at: renewedSub.expirationDateTime,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingSubscription.id);

        return NextResponse.json({
          message: 'Webhook subscription renewed successfully',
          subscription: renewedSub,
          expiresAt: renewedSub.expirationDateTime,
          status: 'renewed'
        });
      } catch (renewError) {
        console.log('Renewal failed, creating new subscription:', renewError);
        // Mark old subscription as inactive and create new one below
        await supabase
          .from('webhook_subscriptions')
          .update({ is_active: false })
          .eq('id', existingSubscription.id);
      }
    }

    // Create new subscription
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
      message: 'Webhook subscription created successfully with automatic renewal',
      subscription: subscription,
      webhookUrl: webhookUrl,
      expiresAt: subscription.expirationDateTime,
      status: 'created'
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

// Add GET endpoint to check and renew all expiring subscriptions
export async function GET() {
  try {
    console.log('Checking for expiring webhook subscriptions...');

    // Find subscriptions expiring in the next 30 minutes
    const thirtyMinsFromNow = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    
    const { data: expiringSubs, error } = await supabase
      .from('webhook_subscriptions')
      .select(`
        *,
        email_accounts (
          id,
          client_id,
          email_address,
          access_token,
          refresh_token
        )
      `)
      .eq('is_active', true)
      .lt('expires_at', thirtyMinsFromNow);

    if (error) {
      console.error('Error fetching expiring subscriptions:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    const renewalResults = [];

    for (const subscription of expiringSubs || []) {
      try {
        console.log('Auto-renewing subscription:', subscription.subscription_id);

        // Get fresh access token using your existing tokenRefresh
        const validToken = await getValidAccessToken(subscription.email_account_id);
        const graphService = new GraphService(validToken);

        // Renew the subscription
        const renewedSub = await graphService.renewSubscription(subscription.subscription_id);

        // Update database with new expiration
        await supabase
          .from('webhook_subscriptions')
          .update({
            expires_at: renewedSub.expirationDateTime,
            updated_at: new Date().toISOString()
          })
          .eq('id', subscription.id);

        renewalResults.push({
          client: subscription.email_accounts.email_address,
          status: 'renewed',
          newExpiry: renewedSub.expirationDateTime
        });

      } catch (renewError) {
        console.error('Auto-renewal failed:', renewError);
        renewalResults.push({
          client: subscription.email_accounts?.email_address,
          status: 'failed',
          error: renewError instanceof Error ? renewError.message : 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      message: 'Automatic webhook renewal check completed',
      checked: expiringSubs?.length || 0,
      renewalResults,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Auto-renewal error:', error);
    return NextResponse.json(
      { error: 'Failed to check subscriptions' },
      { status: 500 }
    );
  }
}