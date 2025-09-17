// Fixed: src/app/api/auth/[...nextauth]/route.ts
// Enhanced OAuth with better refresh token capture

import { NextRequest, NextResponse } from 'next/server';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

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

  console.log('🔐 Starting OAuth flow for client:', clientId);

  const msalConfig = {
    auth: {
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      authority: 'https://login.microsoftonline.com/common'
    }
  };
  const cca = new ConfidentialClientApplication(msalConfig);

  // CRITICAL: Request offline_access explicitly for refresh tokens
  const scopes = [
    'https://graph.microsoft.com/Mail.Read',
    'https://graph.microsoft.com/Mail.ReadWrite',
    'https://graph.microsoft.com/Mail.Send',
    'https://graph.microsoft.com/User.Read',
    'https://graph.microsoft.com/Calendars.Read',
    'offline_access' // This is ESSENTIAL for refresh tokens
  ];

  const authCodeUrlParameters = {
    scopes: scopes,
    redirectUri: `${process.env.WEBHOOK_BASE_URL}/api/auth/callback`,
    state: JSON.stringify({ clientId, returnUrl }),
    prompt: 'consent' as const, // Force consent to ensure refresh token
    responseMode: 'query' as const,
    responseType: 'code' as const
  };

  try {
    const authUrl = await cca.getAuthCodeUrl(authCodeUrlParameters);
    console.log('🔗 Generated auth URL with offline_access scope');
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('❌ Error generating auth URL:', error);
    return NextResponse.json({ error: 'Failed to generate auth URL' }, { status: 500 });
  }
}

async function handleCallback(request: NextRequest, searchParams: URLSearchParams) {
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  console.log('🔙 OAuth callback received');

  if (error) {
    console.error('❌ OAuth error:', error);
    return NextResponse.redirect(`${process.env.WEBHOOK_BASE_URL}/?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    console.error('❌ Missing authorization code or state');
    return NextResponse.json({ error: 'Missing authorization code or state' }, { status: 400 });
  }

  try {
    const { clientId, returnUrl } = JSON.parse(state);
    console.log('🔄 Processing callback for client:', clientId);

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

    console.log('🎫 Acquiring tokens with offline_access...');
    const response = await cca.acquireTokenByCode(tokenRequest);
    
    if (!response) {
      throw new Error('Failed to acquire token - no response received');
    }

    console.log('📊 Token response analysis:', {
      hasAccessToken: !!response.accessToken,
      hasAccount: !!response.account,
      expiresOn: response.expiresOn,
      scopes: response.scopes,
      responseProperties: Object.keys(response)
    });

    // ENHANCED refresh token extraction with debugging
    let refreshToken: string | null = null;
    const responseAny = response as any;

    // Method 1: Direct property access
    if (responseAny.refreshToken) {
      refreshToken = responseAny.refreshToken;
      console.log('✅ Method 1: Found refresh token in response.refreshToken');
    }

    // Method 2: Check account object
    if (!refreshToken && response.account) {
      const accountAny = response.account as any;
      if (accountAny.idTokenClaims?.refresh_token) {
        refreshToken = accountAny.idTokenClaims.refresh_token;
        console.log('✅ Method 2: Found refresh token in account.idTokenClaims');
      }
      if (!refreshToken && accountAny.refreshToken) {
        refreshToken = accountAny.refreshToken;
        console.log('✅ Method 2b: Found refresh token in account.refreshToken');
      }
    }

    // Method 3: Check MSAL cache
    if (!refreshToken) {
      try {
        const cache = cca.getTokenCache();
        const cacheJson = cache.serialize();
        console.log('🔍 MSAL cache contents:', Object.keys(JSON.parse(cacheJson)));
        
        const parsedCache = JSON.parse(cacheJson);
        if (parsedCache.RefreshToken) {
          const refreshTokens = Object.values(parsedCache.RefreshToken) as any[];
          if (refreshTokens.length > 0) {
            refreshToken = refreshTokens[0].secret;
            console.log('✅ Method 3: Found refresh token in MSAL cache');
          }
        }
      } catch (cacheError) {
        console.log('⚠️ Could not access MSAL cache:', cacheError);
      }
    }

    // Method 4: Alternative property names
    if (!refreshToken) {
      const possibleKeys = [
        'refresh_token', 'RefreshToken', 'rt', 'renewalToken',
        'refreshTokenCredential', 'tokenCredential'
      ];
      
      for (const key of possibleKeys) {
        if (responseAny[key]) {
          refreshToken = responseAny[key];
          console.log(`✅ Method 4: Found refresh token in ${key}`);
          break;
        }
      }
    }

    if (!refreshToken) {
      console.error('❌ CRITICAL: No refresh token found in OAuth response');
      console.error('🔍 Full response structure for debugging:');
      console.error(JSON.stringify({
        responseKeys: Object.keys(responseAny),
        accountKeys: response.account ? Object.keys(response.account) : null,
        scopes: response.scopes
      }, null, 2));
    } else {
      console.log('✅ SUCCESS: Refresh token captured successfully!');
      console.log('🔑 Token length:', refreshToken.length);
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
    console.log('👤 User profile retrieved:', userProfile.mail || userProfile.userPrincipalName);

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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'email'
      })
      .select()
      .single();

    if (clientError) {
      console.error('❌ Database error saving client:', clientError);
      throw new Error('Failed to save client information');
    }

    console.log('💾 Client saved to database:', client.email);

    // Create email account record with enhanced logging
    const emailAccountData = {
      client_id: client.id,
      email_address: userProfile.mail || userProfile.userPrincipalName,
      access_token: response.accessToken,
      refresh_token: refreshToken,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log('💾 Saving email account:', {
      email: emailAccountData.email_address,
      hasAccessToken: !!emailAccountData.access_token,
      hasRefreshToken: !!emailAccountData.refresh_token,
      accessTokenLength: emailAccountData.access_token?.length || 0,
      refreshTokenLength: emailAccountData.refresh_token?.length || 0
    });

    const { data: emailAccount, error: accountError } = await supabase
      .from('email_accounts')
      .upsert(emailAccountData, {
        onConflict: 'client_id,email_address'
      })
      .select()
      .single();

    if (accountError) {
      console.error('❌ Email account error:', accountError);
      throw new Error(`Failed to save email account: ${accountError.message}`);
    }

    console.log('✅ Email account saved successfully');

    // Success message based on refresh token availability
    let redirectUrl;
    if (!refreshToken) {
      console.warn('⚠️ WARNING: No refresh token stored - automatic token refresh will not work');
      redirectUrl = `${process.env.WEBHOOK_BASE_URL}${returnUrl}?success=true&client=${client.id}&warning=no_refresh_token`;
    } else {
      console.log('🎉 OAuth authentication completed successfully with refresh token!');
      redirectUrl = `${process.env.WEBHOOK_BASE_URL}${returnUrl}?success=true&client=${client.id}`;
    }

    return NextResponse.redirect(redirectUrl);

  } catch (error) {
    console.error('❌ Callback processing error:', error);
    return NextResponse.redirect(
      `${process.env.WEBHOOK_BASE_URL}/?error=${encodeURIComponent('Failed to complete authentication: ' + (error instanceof Error ? error.message : 'Unknown error'))}`
    );
  }
}