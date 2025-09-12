import { NextRequest, NextResponse } from 'next/server';
import { PublicClientApplication, ConfidentialClientApplication } from '@azure/msal-node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// MSAL Configuration
const msalConfig = {
  auth: {
    clientId: process.env.MICROSOFT_CLIENT_ID!,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
    authority: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || 'common'}`
  }
};

const cca = new ConfidentialClientApplication(msalConfig);

export async function GET(
  request: NextRequest,
  { params }: { params: { nextauth: string[] } }
) {
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
        refresh_token: response.refreshToken,
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
      // Don't fail the auth process if webhook setup fails
    }

    // Redirect to success page
    const successUrl = `${process.env.WEBHOOK_BASE_URL}/auth/success?email=${encodeURIComponent(userInfo.mail || userInfo.userPrincipalName)}&returnUrl=${encodeURIComponent(returnUrl)}`;
    return NextResponse.redirect(successUrl);

  } catch (error) {
    console.error('Token exchange error:', error);
    return NextResponse.redirect(`${process.env.WEBHOOK_BASE_URL}/auth/error?error=${encodeURIComponent('Authentication failed')}`);
  }
}

async function handleSignOut(request: NextRequest, searchParams: URLSearchParams) {
  const clientId = searchParams.get('clientId');
  const returnUrl = searchParams.get('returnUrl') || '/';

  if (clientId) {
    // Deactivate email accounts for this client
    await supabase
      .from('email_accounts')
      .update({ is_active: false })
      .eq('client_id', clientId);
  }

  // Redirect to sign out URL
  const signOutUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(process.env.WEBHOOK_BASE_URL + returnUrl)}`;
  return NextResponse.redirect(signOutUrl);
}

async function setupWebhookSubscription(accessToken: string, emailAddress: string) {
  const subscriptionData = {
    changeType: 'created',
    notificationUrl: `${process.env.WEBHOOK_BASE_URL}/api/webhooks/email-received`,
    resource: '/me/messages',
    expirationDateTime: new Date(Date.now() + 3600000).toISOString(), // 1 hour
    clientState: emailAddress // Use email as client state for identification
  };

  const response = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(subscriptionData)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Webhook subscription failed: ${response.status} - ${error}`);
  }

  const subscription = await response.json();
  console.log('Webhook subscription created:', subscription.id);

  // Store subscription ID for later management
  await supabase
    .from('email_accounts')
    .update({
      subscription_id: subscription.id,
      subscription_expires: subscription.expirationDateTime
    })
    .eq('email_address', emailAddress);

  return subscription;
}

// Handle token refresh
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { refreshToken, clientId } = body;

    if (!refreshToken) {
      return NextResponse.json({ error: 'Refresh token required' }, { status: 400 });
    }

    const refreshRequest = {
      refreshToken: refreshToken,
      scopes: [
        'https://graph.microsoft.com/Mail.Read',
        'https://graph.microsoft.com/Mail.ReadWrite',
        'https://graph.microsoft.com/Mail.Send',
        'https://graph.microsoft.com/Calendars.Read'
      ]
    };

    const response = await cca.acquireTokenByRefreshToken(refreshRequest);

    if (!response) {
      throw new Error('Failed to refresh token');
    }

    // Update stored tokens
    if (clientId) {
      await supabase
        .from('email_accounts')
        .update({
          access_token: response.accessToken,
          refresh_token: response.refreshToken
        })
        .eq('client_id', clientId);
    }

    return NextResponse.json({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      expiresOn: response.expiresOn
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    return NextResponse.json({ 
      error: 'Token refresh failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}