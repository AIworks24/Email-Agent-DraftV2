// Replace your ENTIRE src/app/api/auth/[...nextauth]/route.ts with this corrected version
// This uses the SAME Supabase pattern as your working API routes:

import { NextRequest, NextResponse } from 'next/server';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const msalConfig = {
  auth: {
    clientId: process.env.MICROSOFT_CLIENT_ID!,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
    authority: 'https://login.microsoftonline.com/common'
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
  const returnUrl = searchParams.get('returnUrl') || '/';

  const scopes = [
    'https://graph.microsoft.com/Mail.Read',
    'https://graph.microsoft.com/Mail.ReadWrite',
    'https://graph.microsoft.com/Mail.Send',
    'https://graph.microsoft.com/User.Read',
    'offline_access'
  ];

  const authCodeUrlParameters = {
    scopes: scopes,
    redirectUri: `${process.env.WEBHOOK_BASE_URL}/api/auth/callback`,
    state: JSON.stringify({ clientId, returnUrl }),
    prompt: 'select_account' as const
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
    return NextResponse.redirect(`${process.env.WEBHOOK_BASE_URL}/?error=${encodeURIComponent(error)}`);
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
        'https://graph.microsoft.com/User.Read',
        'offline_access'
      ],
      redirectUri: `${process.env.WEBHOOK_BASE_URL}/api/auth/callback`
    };

    const response = await cca.acquireTokenByCode(tokenRequest);
    
    if (!response) {
      throw new Error('Failed to acquire token');
    }

    // Get user profile from Microsoft Graph
    const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${response.accessToken}`
      }
    });

    if (!userResponse.ok) {
      throw new Error('Failed to get user profile');
    }

    const userProfile = await userResponse.json();

    // Create or update client record
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .upsert({
        id: clientId.startsWith('temp-') ? undefined : clientId,
        name: userProfile.displayName || 'Unknown User',
        email: userProfile.mail || userProfile.userPrincipalName,
        is_active: true,
        created_at: new Date().toISOString()
      }, {
        onConflict: 'email'
      })
      .select()
      .single();

    if (clientError) {
      console.error('Database error:', clientError);
      throw new Error('Failed to save client information');
    }

    // Create email account record
    const { error: accountError } = await supabase
      .from('email_accounts')
      .upsert({
        client_id: client.id,
        email_address: userProfile.mail || userProfile.userPrincipalName,
        access_token: response.accessToken,
        refresh_token: null,
        is_active: true
      }, {
        onConflict: 'client_id,email_address'
      });

    if (accountError) {
      console.error('Email account error:', accountError);
    }

    // Redirect back to dashboard with success
    return NextResponse.redirect(`${process.env.WEBHOOK_BASE_URL}${returnUrl}?success=true&client=${client.id}`);

  } catch (error) {
    console.error('Callback processing error:', error);
    return NextResponse.redirect(`${process.env.WEBHOOK_BASE_URL}/?error=${encodeURIComponent('Failed to complete authentication')}`);
  }
}