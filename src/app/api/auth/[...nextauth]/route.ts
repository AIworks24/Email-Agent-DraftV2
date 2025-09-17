// Fixed: src/app/api/auth/[...nextauth]/route.ts
// Properly capture and store refresh tokens with enhanced logging

import { NextRequest, NextResponse } from 'next/server';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { createClient } from '@supabase/supabase-js';

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

  console.log('Starting OAuth flow for client:', clientId);

  const msalConfig = {
    auth: {
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      authority: 'https://login.microsoftonline.com/common'
    }
  };
  const cca = new ConfidentialClientApplication(msalConfig);

  const scopes = [
    'https://graph.microsoft.com/Mail.Read',
    'https://graph.microsoft.com/Mail.ReadWrite',
    'https://graph.microsoft.com/Mail.Send',
    'https://graph.microsoft.com/User.Read',
    'https://graph.microsoft.com/Calendars.Read',
    'offline_access' // Critical for refresh tokens!
  ];

  const authCodeUrlParameters = {
    scopes: scopes,
    redirectUri: `${process.env.WEBHOOK_BASE_URL}/api/auth/callback`,
    state: JSON.stringify({ clientId, returnUrl }),
    prompt: 'select_account' as const,
    // Add these parameters to ensure refresh token is granted
    responseMode: 'query' as const,
    responseType: 'code' as const
  };

  try {
    const authUrl = await cca.getAuthCodeUrl(authCodeUrlParameters);
    console.log('Generated auth URL with scopes:', scopes);
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

  console.log('OAuth callback received');

  if (error) {
    console.error('OAuth error:', error);
    return NextResponse.redirect(`${process.env.WEBHOOK_BASE_URL}/?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    console.error('Missing authorization code or state');
    return NextResponse.json({ error: 'Missing authorization code or state' }, { status: 400 });
  }

  try {
    const { clientId, returnUrl } = JSON.parse(state);
    console.log('Processing callback for client:', clientId);

    const msalConfig = {
      auth: {
        clientId: process.env.MICROSOFT_CLIENT_ID!,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
        authority: 'https://login.microsoftonline.com/common'
      }
    };
    const cca = new ConfidentialClientApplication(msalConfig);

    const tokenRequest = {
      code: code,
      scopes: [
        'https://graph.microsoft.com/Mail.Read',
        'https://graph.microsoft.com/Mail.ReadWrite',
        'https://graph.microsoft.com/Mail.Send',
        'https://graph.microsoft.com/User.Read',
        'https://graph.microsoft.com/Calendars.Read',
        'offline_access'
      ],
      redirectUri: `${process.env.WEBHOOK_BASE_URL}/api/auth/callback`
    };

    console.log('Acquiring tokens with scopes:', tokenRequest.scopes);
    const response = await cca.acquireTokenByCode(tokenRequest);
    
    if (!response) {
      throw new Error('Failed to acquire token - no response received');
    }

    console.log('Token response received:', {
      hasAccessToken: !!response.accessToken,
      accessTokenExpiry: response.expiresOn,
      hasAccount: !!response.account,
      responseKeys: Object.keys(response)
    });

    // Enhanced refresh token extraction with multiple property checks
    let refreshToken: string | null = null;
    const responseAny = response as any;

    // Check multiple possible properties where refresh token might be stored
    if (responseAny.refreshToken) {
      refreshToken = responseAny.refreshToken;
      console.log('✅ Refresh token found in responseAny.refreshToken');
    } else if (response.account?.idTokenClaims) {
      // Sometimes refresh token is in the account object
      const accountAny = response.account as any;
      if (accountAny.refreshToken) {
        refreshToken = accountAny.refreshToken;
        console.log('✅ Refresh token found in account.refreshToken');
      }
    }

    // Additional check - look in the raw response
    if (!refreshToken) {
      console.log('🔍 Checking all response properties for refresh token...');
      console.log('Response object keys:', Object.keys(responseAny));
      
      // Check common alternative property names
      const possibleRefreshTokenKeys = [
        'refresh_token', 'refreshToken', 'RefreshToken', 
        'rt', 'refresh', 'renewToken'
      ];
      
      for (const key of possibleRefreshTokenKeys) {
        if (responseAny[key]) {
          refreshToken = responseAny[key];
          console.log(`✅ Refresh token found in ${key}`);
          break;
        }
      }
    }

    if (!refreshToken) {
      console.error('❌ CRITICAL: No refresh token received in OAuth response');
      console.error('This means the application will not be able to refresh tokens automatically');
      console.error('Response structure:', JSON.stringify(responseAny, null, 2));
      
      // Continue anyway but log the issue
    } else {
      console.log('✅ Refresh token successfully captured');
    }

    // Get user profile from Microsoft Graph
    const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${response.accessToken}`
      }
    });

    if (!userResponse.ok) {
      throw new Error(`Failed to get user profile: ${userResponse.status}`);
    }

    const userProfile = await userResponse.json();
    console.log('User profile retrieved:', userProfile.mail || userProfile.userPrincipalName);

    // Initialize Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

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
      console.error('Database error saving client:', clientError);
      throw new Error('Failed to save client information');
    }

    console.log('Client saved to database:', client.email);

    // Create email account record with enhanced token storage
    const emailAccountData = {
      client_id: client.id,
      email_address: userProfile.mail || userProfile.userPrincipalName,
      access_token: response.accessToken,
      refresh_token: refreshToken, // This could be null if not received
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log('Saving email account with tokens:', {
      email: emailAccountData.email_address,
      hasAccessToken: !!emailAccountData.access_token,
      hasRefreshToken: !!emailAccountData.refresh_token,
      refreshTokenLength: emailAccountData.refresh_token?.length || 0
    });

    const { error: accountError } = await supabase
      .from('email_accounts')
      .upsert(emailAccountData, {
        onConflict: 'client_id,email_address'
      });

    if (accountError) {
      console.error('Email account error:', accountError);
      throw new Error(`Failed to save email account: ${accountError.message}`);
    }

    console.log('✅ Email account saved successfully with tokens');

    // If no refresh token was received, log a warning but don't fail
    if (!refreshToken) {
      console.warn('⚠️ WARNING: No refresh token stored - automatic token refresh will not work');
      console.warn('User will need to re-authenticate when access token expires');
    }

    console.log('🎉 OAuth authentication completed successfully');

    // Redirect back to dashboard with success
    const redirectUrl = `${process.env.WEBHOOK_BASE_URL}${returnUrl}?success=true&client=${client.id}${!refreshToken ? '&warning=no_refresh_token' : ''}`;
    return NextResponse.redirect(redirectUrl);

  } catch (error) {
    console.error('Callback processing error:', error);
    return NextResponse.redirect(
      `${process.env.WEBHOOK_BASE_URL}/?error=${encodeURIComponent('Failed to complete authentication: ' + (error instanceof Error ? error.message : 'Unknown error'))}`
    );
  }
}