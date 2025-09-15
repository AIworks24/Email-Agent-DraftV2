import { NextRequest, NextResponse } from 'next/server';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { createClient } from '@supabase/supabase-js';
import { GraphService } from '@/lib/microsoftGraph';
import { generateClientState } from '@/lib/utils';

// Safe environment variable access - don't throw during build
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const microsoftClientId = process.env.MICROSOFT_CLIENT_ID;
const microsoftClientSecret = process.env.MICROSOFT_CLIENT_SECRET;
const microsoftTenantId = process.env.MICROSOFT_TENANT_ID;

// Only create Supabase client if env vars are available
const supabase = (supabaseUrl && supabaseServiceKey) ? createClient(
  supabaseUrl,
  supabaseServiceKey
) : null;

// MSAL Configuration - only if env vars are available
const msalConfig = (microsoftClientId && microsoftClientSecret) ? {
  auth: {
    clientId: microsoftClientId,
    clientSecret: microsoftClientSecret,
    authority: `https://login.microsoftonline.com/${microsoftTenantId || 'common'}`
  }
} : null;

const cca = msalConfig ? new ConfidentialClientApplication(msalConfig) : null;

export async function GET(
  request: NextRequest,
  { params }: { params: { nextauth: string[] } }
) {
  // Return error if not properly configured
  if (!supabase || !cca) {
    return NextResponse.json({ 
      error: 'Service not configured',
      message: 'Environment variables not set'
    }, { status: 503 });
  }

  const [action] = params.nextauth;
  const { searchParams } = new URL(request.url);

  try {
    switch (action) {
      case 'signin':
        return handleSignIn(request, searchParams);
      case 'callback':
        return handleCallback(request, searchParams);
      case 'signout':
        return handleSignOut(request, searchParams);
      default:
        return NextResponse.json({ error: 'Invalid auth action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json({ 
      error: 'Authentication failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

async function handleSignIn(request: NextRequest, searchParams: URLSearchParams) {
  if (!supabase || !cca) {
    return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
  }

  const clientId = searchParams.get('clientId');
  const returnUrl = searchParams.get('returnUrl') || '/dashboard';

  if (!clientId) {
    return NextResponse.json({ error: 'Client ID required' }, { status: 400 });
  }

  // Check if client exists
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, email')
    .eq('id', clientId)
    .single();

  if (clientError || !client) {
    return NextResponse.json({ error: 'Invalid client' }, { status: 400 });
  }

  const scopes = [
    'https://graph.microsoft.com/Mail.Read',
    'https://graph.microsoft.com/Mail.ReadWrite',
    'https://graph.microsoft.com/Mail.Send',
    'https://graph.microsoft.com/Calendars.Read',
    'offline_access'
  ];

  const authCodeUrlParameters = {
    scopes: scopes,
    redirectUri: `${process.env.WEBHOOK_BASE_URL}/api/auth/callback`,
    state: JSON.stringify({ clientId, returnUrl })
  };

  try {
    const authUrl = await cca.getAuthCodeUrl(authCodeUrlParameters);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('Error generating auth URL:', error);
    return NextResponse.json({ error: 'Failed to generate auth URL' }, { status: 500 });
  }
}

async function handleCallback(request: NextRequest, searchParams: URLSearchParams) {
  if (!supabase || !cca) {
    return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
  }

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    console.error('OAuth error:', error);
    return NextResponse.redirect(`${process.env.WEBHOOK_BASE_URL}/auth/error?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing authorization code or state' }, { status: 400 });
  }

  try {
    const { clientId, returnUrl } = JSON.parse(state);

    const tokenRequest = {
      code: code,
      scopes: [
        'https://graph.microsoft.com/Mail.Read',
        'https://graph.microsoft.com/Mail.ReadWrite', 
        'https://graph.microsoft.com/Mail.Send',
        'https://graph.microsoft.com/Calendars.Read',
        'offline_access'
      ],
      redirectUri: `${process.env.WEBHOOK_BASE_URL}/api/auth/callback`
    };

    const response = await cca.acquireTokenByCode(tokenRequest);

    if (!response) {
      throw new Error('Failed to acquire token');
    }

    // Get user info from Microsoft Graph
    const userInfoResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${response.accessToken}`
      }
    });

    if (!userInfoResponse.ok) {
      throw new Error('Failed to get user info');
    }

    const userInfo = await userInfoResponse.json();

    // Store or update email account in database
    const { data: emailAccount, error: accountError } = await supabase
      .from('email_accounts')
      .upsert({
        client_id: clientId,
        email_address: userInfo.mail || userInfo.userPrincipalName,
        access_token: response.accessToken,
        refresh_token: (response as any).refreshToken || null,
        is_active: true
      }, {
        onConflict: 'client_id,email_address'
      })
      .select()
      .single();

    if (accountError) {
      console.error('Database error:', accountError);
      throw new Error('Failed to save account information');
    }

    // Set up webhook subscription for this email account
    try {
      await setupWebhookSubscription(response.accessToken, userInfo.mail || userInfo.userPrincipalName);
    } catch (webhookError) {
      console.error('Webhook setup error:', webhookError);
      // Don't fail the whole process if webhook setup fails
    }

    // Redirect to success page
    return NextResponse.redirect(`${process.env.WEBHOOK_BASE_URL}${returnUrl}?success=true`);

  } catch (error) {
    console.error('Callback processing error:', error);
    return NextResponse.redirect(`${process.env.WEBHOOK_BASE_URL}/auth/error?error=${encodeURIComponent('Failed to process authentication')}`);
  }
}

async function handleSignOut(request: NextRequest, searchParams: URLSearchParams) {
  if (!supabase) {
    return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
  }

  const clientId = searchParams.get('clientId');
  
  if (clientId) {
    // Deactivate email accounts for this client
    await supabase
      .from('email_accounts')
      .update({ is_active: false })
      .eq('client_id', clientId);
  }

  return NextResponse.json({ success: true });
}

async function setupWebhookSubscription(accessToken: string, emailAddress: string) {
  if (!supabase) {
    throw new Error('Supabase not configured');
  }

  try {
    const graphService = new GraphService(accessToken);
    const clientState = generateClientState(emailAddress);
    
    const subscription = await graphService.subscribeToEmails(
      `${process.env.WEBHOOK_BASE_URL}/api/webhooks/email-received`,
      clientState
    );

    // Store subscription info in database
    await supabase
      .from('webhook_subscriptions')
      .insert({
        email_account_id: emailAddress, // This should be the actual account ID
        subscription_id: subscription.id,
        webhook_url: `${process.env.WEBHOOK_BASE_URL}/api/webhooks/email-received`,
        client_state: clientState,
        expires_at: subscription.expirationDateTime,
        is_active: true
      });

    console.log('Webhook subscription created:', subscription.id);
  } catch (error) {
    console.error('Failed to setup webhook subscription:', error);
    throw error;
  }
}