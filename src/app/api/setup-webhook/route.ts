// Enhanced: src/app/api/setup-webhook/route.ts
// Better handling of missing refresh tokens and robust error recovery

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GraphService } from '@/lib/microsoftGraph';
import { getValidAccessToken, refreshAllActiveTokens } from '@/lib/tokenRefresh';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { clientId } = await request.json();
    console.log('Setting up webhook for client:', clientId);

    // Get client's email account
    const { data: emailAccount, error } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('client_id', clientId)
      .eq('is_active', true)
      .single();

    if (error || !emailAccount) {
      console.error('No email account found for client:', clientId);
      return NextResponse.json(
        { error: 'No active email account found for client' },
        { status: 404 }
      );
    }

    console.log('Email account found:', emailAccount.email_address);

    // Check if refresh token is available
    if (!emailAccount.refresh_token) {
      console.warn('⚠️ No refresh token available for account:', emailAccount.email_address);
      return NextResponse.json({
        error: 'No refresh token available',
        message: 'This client needs to re-authenticate to enable automatic token refresh. The current access token will work until it expires (~1 hour).',
        recommendation: 'Please remove and re-add this client to get a refresh token.',
        canContinue: true
      }, { status: 400 });
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
        console.log('Existing valid subscription found');
        return NextResponse.json({
          message: 'Webhook subscription already active',
          subscription: { id: existingSubscription.subscription_id },
          expiresAt: existingSubscription.expires_at,
          status: 'existing'
        });
      }
      
      // Existing subscription is expiring soon, try to renew it
      try {
        console.log('Attempting to renew expiring subscription...');
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

        console.log('✅ Subscription renewed successfully');
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
      console.log('Getting valid access token...');
      accessToken = await getValidAccessToken(emailAccount.id);
      console.log('✅ Access token obtained');
    } catch (tokenError) {
      console.error('❌ Token refresh failed:', tokenError);
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

    console.log('Creating new webhook subscription...');
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

    console.log('✅ Webhook subscription created successfully');
    return NextResponse.json({
      message: 'Webhook subscription created successfully with automatic renewal',
      subscription: subscription,
      webhookUrl: webhookUrl,
      expiresAt: subscription.expirationDateTime,
      status: 'created'
    });

  } catch (error) {
    console.error('❌ Webhook setup error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to setup webhook',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Enhanced GET endpoint for cron job with better error handling
export async function GET() {
  try {
    console.log('🔄 Starting automatic webhook renewal check...');

    // First, try to refresh all active tokens proactively
    try {
      await refreshAllActiveTokens();
      console.log('✅ Proactive token refresh completed');
    } catch (refreshError) {
      console.error('⚠️ Proactive token refresh failed:', refreshError);
    }

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
          refresh_token,
          is_active
        )
      `)
      .eq('is_active', true)
      .lt('expires_at', thirtyMinsFromNow);

    if (error) {
      console.error('❌ Error fetching expiring subscriptions:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    console.log(`📊 Found ${expiringSubs?.length || 0} expiring subscriptions`);

    if (!expiringSubs || expiringSubs.length === 0) {
      return NextResponse.json({
        message: 'No expiring subscriptions found',
        checked: 0,
        renewalResults: [],
        timestamp: new Date().toISOString()
      });
    }

    const renewalResults = [];

    for (const subscription of expiringSubs) {
      const emailAccount = subscription.email_accounts;
      
      try {
        console.log(`🔄 Processing subscription for: ${emailAccount?.email_address}`);

        // Skip if email account is inactive
        if (!emailAccount?.is_active) {
          console.log(`⏭️ Skipping inactive account: ${emailAccount?.email_address}`);
          renewalResults.push({
            client: emailAccount?.email_address,
            status: 'skipped',
            reason: 'Account is inactive'
          });
          continue;
        }

        // Check if refresh token is available
        if (!emailAccount?.refresh_token) {
          console.log(`⚠️ No refresh token for: ${emailAccount?.email_address}`);
          
          // Mark subscription as inactive since we can't renew it
          await supabase
            .from('webhook_subscriptions')
            .update({ 
              is_active: false,
              updated_at: new Date().toISOString()
            })
            .eq('id', subscription.id);

          renewalResults.push({
            client: emailAccount?.email_address,
            status: 'failed',
            error: 'No refresh token available - client needs to re-authenticate'
          });
          continue;
        }

        // Get fresh access token using token refresh
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

        console.log(`✅ Subscription renewed for: ${emailAccount.email_address}`);
        renewalResults.push({
          client: emailAccount.email_address,
          status: 'renewed',
          newExpiry: renewedSub.expirationDateTime
        });

      } catch (renewError) {
        console.error(`❌ Auto-renewal failed for ${emailAccount?.email_address}:`, renewError);
        
        // If renewal fails, mark subscription as inactive
        await supabase
          .from('webhook_subscriptions')
          .update({ 
            is_active: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', subscription.id);

        renewalResults.push({
          client: emailAccount?.email_address,
          status: 'failed',
          error: renewError instanceof Error ? renewError.message : 'Unknown error'
        });
      }
    }

    const summary = {
      message: 'Automatic webhook renewal check completed',
      checked: expiringSubs?.length || 0,
      renewed: renewalResults.filter(r => r.status === 'renewed').length,
      failed: renewalResults.filter(r => r.status === 'failed').length,
      renewalResults,
      timestamp: new Date().toISOString()
    };

    console.log('📊 Renewal summary:', summary);
    return NextResponse.json(summary);

  } catch (error) {
    console.error('❌ Auto-renewal error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to check subscriptions',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}