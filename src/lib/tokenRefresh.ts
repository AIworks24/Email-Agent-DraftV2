// Enhanced: src/lib/tokenRefresh.ts
// Fixed token refresh with better error handling and logging

import { ConfidentialClientApplication } from '@azure/msal-node';
import { createClient } from '@supabase/supabase-js';
import { encryptToken, decryptToken } from './encryption';

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

// Helper function to get decrypted refresh token
async function getDecryptedRefreshToken(emailAccount: any): Promise<string> {
  return decryptToken(emailAccount.refresh_token || '');
}

export async function refreshAccessToken(emailAccountId: string): Promise<string> {
  try {
    console.log('🔄 Starting token refresh for account:', emailAccountId);
    
    const { data: emailAccount, error } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('id', emailAccountId)
      .single();

    if (error || !emailAccount) {
      throw new Error('Email account not found');
    }

    console.log('📧 Email account:', emailAccount.email_address);

    if (!emailAccount.refresh_token) {
      throw new Error('No refresh token available - user needs to re-authenticate');
    }

    const decryptedRefreshToken = decryptToken(emailAccount.refresh_token);

    // DIRECT HTTP CALL — bypass MSAL entirely so we see exactly what Microsoft returns
    console.log('🌐 Calling Microsoft token endpoint directly...');
    
    const params = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      refresh_token: decryptedRefreshToken,
      grant_type: 'refresh_token',
      scope: [
        'https://graph.microsoft.com/Mail.Read',
        'https://graph.microsoft.com/Mail.ReadWrite',
        'https://graph.microsoft.com/Mail.Send',
        'https://graph.microsoft.com/User.Read',
        'https://graph.microsoft.com/Calendars.Read',
        'offline_access'
      ].join(' ')
    });

    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('❌ Microsoft rejected token refresh:', tokenData);
      const errorMsg = tokenData.error_description || tokenData.error || 'Unknown error';
      throw new Error(`${tokenData.error || 'refresh_failed'}: ${errorMsg}`);
    }

    // Explicit visibility into what Microsoft returned
    console.log('📊 Microsoft response fields:', Object.keys(tokenData));
    console.log('🔑 New access_token received:', !!tokenData.access_token);
    console.log('🔄 New refresh_token received:', !!tokenData.refresh_token);
    
    if (tokenData.refresh_token) {
      const rotated = tokenData.refresh_token.substring(0, 30) !== decryptedRefreshToken.substring(0, 30);
      console.log(`🔄 Refresh token rotated: ${rotated ? 'YES ✅ (90-day clock reset)' : 'NO — Microsoft returned the same token'}`);
    } else {
      console.error('⚠️ CRITICAL: Microsoft did NOT return a refresh_token field. 90-day clock NOT reset for this account!');
    }

    const { error: updateError } = await supabase
      .from('email_accounts')
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token
          ? encryptToken(tokenData.refresh_token)
          : emailAccount.refresh_token,
        updated_at: new Date().toISOString()
      })
      .eq('id', emailAccountId);

    if (updateError) {
      console.error('❌ Database update failed:', updateError);
    } else {
      console.log('✅ Database updated with new tokens');
    }

    return tokenData.access_token;

  } catch (error) {
    console.error('❌ Token refresh failed for account:', emailAccountId, error);
    
    // SAFETY IMPROVEMENT: only deactivate on confirmed invalid_grant, not any error containing that string
    const isDefinitelyDead = error instanceof Error && 
      (error.message.startsWith('invalid_grant:') || error.message.includes('AADSTS700082'));
    
    if (isDefinitelyDead) {
      console.error('🚨 Refresh token confirmed dead — marking account inactive');
      await supabase
        .from('email_accounts')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', emailAccountId);
    } else {
      console.warn('⚠️ Refresh failed but not with definitive invalid_grant — NOT deactivating account');
    }
    
    throw new Error(`Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getValidAccessToken(emailAccountId: string): Promise<string> {
  try {
    console.log('Getting valid access token for account:', emailAccountId);
    
    // Get current email account
    const { data: emailAccount, error } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('id', emailAccountId)
      .single();

    if (error || !emailAccount) {
      throw new Error('Email account not found');
    }

    if (!emailAccount.is_active) {
      throw new Error('Email account is inactive - requires re-authentication');
    }

    // Test the current token first
    try {
      console.log('Testing current access token...');
      const testResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          'Authorization': `Bearer ${emailAccount.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (testResponse.ok) {
        console.log('Current token is valid');
        return emailAccount.access_token;
      } else if (testResponse.status === 401) {
        console.log('Current token is expired, attempting refresh...');
      } else {
        console.log('Token test failed with status:', testResponse.status);
      }
    } catch (testError) {
      console.log('Current token test failed, attempting refresh...', testError);
    }

    // Token is expired or invalid, try to refresh
    return await refreshAccessToken(emailAccountId);

  } catch (error) {
    console.error('Failed to get valid access token:', error);
    throw error;
  }
}

// New function to proactively refresh tokens before they expire
export async function refreshAllActiveTokens(): Promise<void> {
  try {
    console.log('Starting proactive token refresh for all active accounts...');
    
    const { data: accounts, error } = await supabase
      .from('email_accounts')
      .select('id, email_address, updated_at')
      .eq('is_active', true);

    if (error) {
      console.error('Failed to fetch active accounts:', error);
      return;
    }

    if (!accounts || accounts.length === 0) {
      console.log('No active email accounts found');
      return;
    }

    console.log(`Found ${accounts.length} active accounts to refresh`);

    for (const account of accounts) {
      try {
        // Check if token was last updated more than 45 minutes ago
        const lastUpdated = new Date(account.updated_at);
        const fortyFiveMinsAgo = new Date(Date.now() - 45 * 60 * 1000);
        
        if (lastUpdated < fortyFiveMinsAgo) {
          console.log(`Refreshing token for ${account.email_address}...`);
          await refreshAccessToken(account.id);
          console.log(`Token refreshed successfully for ${account.email_address}`);
          
          // Add small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          console.log(`Token for ${account.email_address} is still fresh`);
        }
      } catch (refreshError) {
        console.error(`Failed to refresh token for ${account.email_address}:`, refreshError);
      }
    }

    console.log('Proactive token refresh completed');
  } catch (error) {
    console.error('Proactive token refresh failed:', error);
  }
}