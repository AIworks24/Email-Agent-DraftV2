// Create: src/lib/tokenRefresh.ts
// Utility to refresh Microsoft Graph tokens

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

export async function refreshAccessToken(emailAccountId: string): Promise<string> {
  try {
    // Get current email account
    const { data: emailAccount, error } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('id', emailAccountId)
      .single();

    if (error || !emailAccount) {
      throw new Error('Email account not found');
    }

    // Check if we have a refresh token
    if (!emailAccount.refresh_token) {
      throw new Error('No refresh token available - user needs to re-authenticate');
    }

    const cca = new ConfidentialClientApplication(msalConfig);

    // Use refresh token to get new access token
    const refreshTokenRequest = {
      refreshToken: emailAccount.refresh_token,
      scopes: [
        'https://graph.microsoft.com/Mail.Read',
        'https://graph.microsoft.com/Mail.ReadWrite', 
        'https://graph.microsoft.com/Mail.Send',
        'https://graph.microsoft.com/User.Read',
        'offline_access'
      ]
    };

    const response = await cca.acquireTokenByRefreshToken(refreshTokenRequest);
    
    if (!response) {
      throw new Error('Failed to refresh token');
    }

    // Cast response to any to access refreshToken (it exists but not in types)
    const responseAny = response as any;

    // Update database with new tokens
    const { error: updateError } = await supabase
      .from('email_accounts')
      .update({
        access_token: response.accessToken,
        refresh_token: responseAny.refreshToken || emailAccount.refresh_token, // Keep old if new not provided
        updated_at: new Date().toISOString()
      })
      .eq('id', emailAccountId);

    if (updateError) {
      console.error('Failed to update tokens in database:', updateError);
      // Don't throw - we still have the new token to return
    }

    console.log('Token refreshed successfully for account:', emailAccountId);
    return response.accessToken;

  } catch (error) {
    console.error('Token refresh failed:', error);
    throw new Error(`Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getValidAccessToken(emailAccountId: string): Promise<string> {
  try {
    // Get current email account
    const { data: emailAccount, error } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('id', emailAccountId)
      .single();

    if (error || !emailAccount) {
      throw new Error('Email account not found');
    }

    // Try to use current token first
    try {
      // Test the current token with a simple Graph API call
      const testResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          'Authorization': `Bearer ${emailAccount.access_token}`
        }
      });

      if (testResponse.ok) {
        // Token is still valid
        return emailAccount.access_token;
      }
    } catch (testError) {
      console.log('Current token test failed, attempting refresh...');
    }

    // Token is expired or invalid, try to refresh
    return await refreshAccessToken(emailAccountId);

  } catch (error) {
    console.error('Failed to get valid access token:', error);
    throw error;
  }
}