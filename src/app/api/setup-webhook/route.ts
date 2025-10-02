// FIXED: src/app/api/setup-webhook/route.ts
// Bulletproof auto-renewal with self-healing capabilities

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GraphService } from '@/lib/microsoftGraph';
import { getValidAccessToken, refreshAllActiveTokens } from '@/lib/tokenRefresh';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { clientId } = await request.json();
    console.log('📧 Setting up webhook for client:', clientId);

    const { data: emailAccount, error } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('client_id', clientId)
      .eq('is_active', true)
      .single();

    if (error || !emailAccount) {
      console.error('❌ No email account found for client:', clientId);
      return NextResponse.json(
        { error: 'No active email account found for client' },
        { status: 404 }
      );
    }

    console.log('✅ Email account found:', emailAccount.email_address);

    if (!emailAccount.refresh_token) {
      console.warn('⚠️ No refresh token available for account:', emailAccount.email_address);
      return NextResponse.json({
        error: 'No refresh token available',
        message: 'This client needs to re-authenticate to enable automatic token refresh.',
        recommendation: 'Please remove and re-add this client to get a refresh token.',
        canContinue: true
      }, { status: 400 });
    }

    // 🆕 STEP 1: Get valid token
    let accessToken;
    try {
      accessToken = await getValidAccessToken(emailAccount.id);
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

    const graphService = new GraphService(accessToken);

    // 🆕 STEP 2: Check existing subscriptions in MICROSOFT GRAPH (not just database)
    console.log('🔍 Checking existing subscriptions in Microsoft Graph...');
    const graphSubs = await graphService.listAllSubscriptions();
    
    // Filter for OUR subscriptions (by webhook URL)
    const baseUrl = process.env.WEBHOOK_BASE_URL;
    const ourSubs = graphSubs.filter(sub => 
      sub.notificationUrl?.includes(baseUrl || '')
    );

    console.log(`📊 Found ${ourSubs.length} existing subscriptions in Microsoft Graph`);

    // 🆕 STEP 3: Validate existing subscriptions
    const validSubs = {
      creation: ourSubs.find(sub => 
        sub.notificationUrl.includes('/email-received') &&
        sub.changeType === 'created' &&
        sub.resource.includes('Inbox')
      ),
      deletion: ourSubs.find(sub => 
        sub.notificationUrl.includes('/email-deleted') &&
        sub.changeType === 'deleted' &&
        sub.resource.includes('Inbox')
      )
    };

    // Check if both are valid and not expiring soon
    const now = Date.now();
    const oneHourFromNow = now + (60 * 60 * 1000);
    
    const creationValid = validSubs.creation && 
      new Date(validSubs.creation.expirationDateTime).getTime() > oneHourFromNow;
    const deletionValid = validSubs.deletion && 
      new Date(validSubs.deletion.expirationDateTime).getTime() > oneHourFromNow;

    if (creationValid && deletionValid) {
      console.log('✅ Both subscriptions exist and are valid (>1 hour remaining)');
      
      // Sync database with actual state
      await syncDatabaseWithGraph(emailAccount.id, validSubs);
      
      return NextResponse.json({
        message: 'Both webhook subscriptions already active and valid',
        subscriptions: {
          creation: { 
            id: validSubs.creation.id, 
            expiresAt: validSubs.creation.expirationDateTime 
          },
          deletion: { 
            id: validSubs.deletion.id, 
            expiresAt: validSubs.deletion.expirationDateTime 
          }
        },
        status: 'existing'
      });
    }

    // 🆕 STEP 4: Clean up old/invalid subscriptions
    console.log('🧹 Cleaning up old/invalid subscriptions...');
    
    // Deactivate all in database first
    await supabase
      .from('webhook_subscriptions')
      .update({ is_active: false })
      .eq('email_account_id', emailAccount.id);

    // Delete ALL existing subscriptions in Microsoft Graph (clean slate)
    for (const sub of ourSubs) {
      try {
        await graphService.deleteSubscription(sub.id);
        console.log(`   🗑️ Deleted old subscription: ${sub.id}`);
      } catch (err) {
        console.log(`   ⚠️ Could not delete ${sub.id} (already gone)`);
      }
    }

    // 🆕 STEP 5: Create fresh subscriptions with LONGER duration
    console.log('➕ Creating fresh subscriptions...');
    
    const webhookUrl = `${baseUrl}/api/webhooks/email-received`;
    const deleteWebhookUrl = `${baseUrl}/api/webhooks/email-deleted`;
    const clientState = `email-agent-${emailAccount.email_address}-${Date.now()}`;

    const creationSub = await graphService.subscribeToEmails(webhookUrl, clientState);
    const deletionSub = await graphService.subscribeToEmailDeletions(deleteWebhookUrl, clientState);

    // 🆕 STEP 6: Save to database with tracking
    const { error: subError } = await supabase
      .from('webhook_subscriptions')
      .insert([
        {
          email_account_id: emailAccount.id,
          subscription_id: creationSub.id,
          webhook_url: webhookUrl,
          client_state: clientState,
          expires_at: creationSub.expirationDateTime,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          email_account_id: emailAccount.id,
          subscription_id: deletionSub.id,
          webhook_url: deleteWebhookUrl,
          client_state: `${clientState}-delete`,
          expires_at: deletionSub.expirationDateTime,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]);

    if (subError) {
      console.error('❌ Failed to save subscription:', subError);
    }

    console.log('✅ Webhook subscriptions created successfully');
    return NextResponse.json({
      message: 'Webhook subscriptions created successfully',
      subscriptions: {
        create: creationSub,
        delete: deletionSub
      },
      webhookUrls: {
        create: webhookUrl,
        delete: deleteWebhookUrl
      },
      expiresAt: creationSub.expirationDateTime,
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

// 🆕 ENHANCED GET endpoint - ROBUST AUTO-RENEWAL WITH SELF-HEALING
export async function GET() {
  try {
    console.log('🔄 ========================================');
    console.log('🔄 AUTO-RENEWAL CHECK STARTED');
    console.log('🔄 Time:', new Date().toISOString());
    console.log('🔄 ========================================');

    // Refresh tokens proactively
    try {
      await refreshAllActiveTokens();
      console.log('✅ Token refresh completed');
    } catch (refreshError) {
      console.error('⚠️ Token refresh failed:', refreshError);
    }

    // Get all active email accounts
    const { data: emailAccounts, error: accountError } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('is_active', true);

    if (accountError || !emailAccounts || emailAccounts.length === 0) {
      console.log('⏭️ No active email accounts found');
      return NextResponse.json({
        message: 'No active email accounts',
        timestamp: new Date().toISOString()
      });
    }

    console.log(`📊 Found ${emailAccounts.length} active email accounts`);

    const renewalResults = [];

    for (const emailAccount of emailAccounts) {
      try {
        console.log(`\n🔍 Processing: ${emailAccount.email_address}`);

        if (!emailAccount.refresh_token) {
          console.log('⚠️ No refresh token - skipping');
          renewalResults.push({
            email: emailAccount.email_address,
            status: 'skipped',
            reason: 'No refresh token'
          });
          continue;
        }

        // Get valid token
        const validToken = await getValidAccessToken(emailAccount.id);
        const graphService = new GraphService(validToken);

        // 🆕 KEY FIX: Check ACTUAL subscriptions in Microsoft Graph, not database
        console.log('🔍 Checking Microsoft Graph for actual subscriptions...');
        const graphSubs = await graphService.listAllSubscriptions();
        
        const baseUrl = process.env.WEBHOOK_BASE_URL;
        const ourSubs = graphSubs.filter(sub => 
          sub.notificationUrl?.includes(baseUrl || '')
        );

        console.log(`📊 Found ${ourSubs.length} subscriptions in Microsoft Graph`);

        // Validate subscriptions
        const validSubs = {
          creation: ourSubs.find(sub => 
            sub.notificationUrl.includes('/email-received') &&
            sub.changeType === 'created'
          ),
          deletion: ourSubs.find(sub => 
            sub.notificationUrl.includes('/email-deleted') &&
            sub.changeType === 'deleted'
          )
        };

        // 🆕 KEY FIX: Check expiration with WIDER WINDOW (50 minutes instead of 30)
        const now = Date.now();
        const fiftyMinsFromNow = now + (50 * 60 * 1000); // 50 minutes

        let needsCreation = false;
        let needsDeletion = false;

        // Check creation subscription
        if (!validSubs.creation) {
          console.log('❌ Creation subscription MISSING');
          needsCreation = true;
        } else {
          const expiresAt = new Date(validSubs.creation.expirationDateTime).getTime();
          const minutesLeft = Math.round((expiresAt - now) / 1000 / 60);
          console.log(`📅 Creation subscription expires in ${minutesLeft} minutes`);
          
          if (expiresAt < fiftyMinsFromNow) {
            console.log('⏰ Creation subscription expiring soon - will renew');
            try {
              await graphService.renewSubscription(validSubs.creation.id);
              console.log('✅ Creation subscription renewed');
              
              // Update database
              await supabase
                .from('webhook_subscriptions')
                .update({
                  expires_at: new Date(now + 3600000).toISOString(),
                  updated_at: new Date().toISOString()
                })
                .eq('subscription_id', validSubs.creation.id);
                
            } catch (renewError) {
              console.error('❌ Renewal failed - will recreate:', renewError);
              needsCreation = true;
            }
          }
        }

        // Check deletion subscription
        if (!validSubs.deletion) {
          console.log('❌ Deletion subscription MISSING');
          needsDeletion = true;
        } else {
          const expiresAt = new Date(validSubs.deletion.expirationDateTime).getTime();
          const minutesLeft = Math.round((expiresAt - now) / 1000 / 60);
          console.log(`📅 Deletion subscription expires in ${minutesLeft} minutes`);
          
          if (expiresAt < fiftyMinsFromNow) {
            console.log('⏰ Deletion subscription expiring soon - will renew');
            try {
              await graphService.renewSubscription(validSubs.deletion.id);
              console.log('✅ Deletion subscription renewed');
              
              // Update database
              await supabase
                .from('webhook_subscriptions')
                .update({
                  expires_at: new Date(now + 3600000).toISOString(),
                  updated_at: new Date().toISOString()
                })
                .eq('subscription_id', validSubs.deletion.id);
                
            } catch (renewError) {
              console.error('❌ Renewal failed - will recreate:', renewError);
              needsDeletion = true;
            }
          }
        }

        // 🆕 SELF-HEALING: Automatically recreate missing/failed subscriptions
        if (needsCreation || needsDeletion) {
          console.log('🔧 SELF-HEALING: Creating missing subscriptions...');
          
          const webhookUrl = `${baseUrl}/api/webhooks/email-received`;
          const deleteWebhookUrl = `${baseUrl}/api/webhooks/email-deleted`;
          const clientState = `email-agent-${emailAccount.email_address}-${Date.now()}`;

          // Create missing subscriptions
          if (needsCreation) {
            try {
              console.log('➕ Creating email creation subscription...');
              const newSub = await graphService.subscribeToEmails(webhookUrl, clientState);
              
              await supabase
                .from('webhook_subscriptions')
                .insert({
                  email_account_id: emailAccount.id,
                  subscription_id: newSub.id,
                  webhook_url: webhookUrl,
                  client_state: clientState,
                  expires_at: newSub.expirationDateTime,
                  is_active: true,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                });
              
              console.log('✅ Creation subscription recreated');
            } catch (createError) {
              console.error('❌ Failed to recreate creation subscription:', createError);
            }
          }

          if (needsDeletion) {
            try {
              console.log('➕ Creating email deletion subscription...');
              const newSub = await graphService.subscribeToEmailDeletions(
                deleteWebhookUrl, 
                `${clientState}-delete`
              );
              
              await supabase
                .from('webhook_subscriptions')
                .insert({
                  email_account_id: emailAccount.id,
                  subscription_id: newSub.id,
                  webhook_url: deleteWebhookUrl,
                  client_state: `${clientState}-delete`,
                  expires_at: newSub.expirationDateTime,
                  is_active: true,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                });
              
              console.log('✅ Deletion subscription recreated');
            } catch (createError) {
              console.error('❌ Failed to recreate deletion subscription:', createError);
            }
          }

          renewalResults.push({
            email: emailAccount.email_address,
            status: 'self-healed',
            recreated: { creation: needsCreation, deletion: needsDeletion }
          });
        } else {
          renewalResults.push({
            email: emailAccount.email_address,
            status: 'healthy',
            message: 'All subscriptions valid'
          });
        }

      } catch (accountError) {
        console.error(`❌ Error processing ${emailAccount.email_address}:`, accountError);
        renewalResults.push({
          email: emailAccount.email_address,
          status: 'error',
          error: accountError instanceof Error ? accountError.message : 'Unknown error'
        });
      }
    }

    const summary = {
      message: 'Auto-renewal check completed',
      timestamp: new Date().toISOString(),
      accountsChecked: emailAccounts.length,
      healthy: renewalResults.filter(r => r.status === 'healthy').length,
      selfHealed: renewalResults.filter(r => r.status === 'self-healed').length,
      errors: renewalResults.filter(r => r.status === 'error').length,
      results: renewalResults
    };

    console.log('✅ ========================================');
    console.log('✅ AUTO-RENEWAL CHECK COMPLETE');
    console.log('✅', JSON.stringify(summary, null, 2));
    console.log('✅ ========================================');

    return NextResponse.json(summary);

  } catch (error) {
    console.error('❌ Auto-renewal error:', error);
    return NextResponse.json(
      { 
        error: 'Auto-renewal check failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// 🆕 Helper function to sync database with actual Microsoft Graph state
async function syncDatabaseWithGraph(emailAccountId: string, validSubs: any) {
  try {
    // Deactivate all existing records
    await supabase
      .from('webhook_subscriptions')
      .update({ is_active: false })
      .eq('email_account_id', emailAccountId);

    // Upsert the current valid subscriptions
    const inserts = [];
    
    if (validSubs.creation) {
      inserts.push({
        email_account_id: emailAccountId,
        subscription_id: validSubs.creation.id,
        webhook_url: validSubs.creation.notificationUrl,
        client_state: validSubs.creation.clientState,
        expires_at: validSubs.creation.expirationDateTime,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }

    if (validSubs.deletion) {
      inserts.push({
        email_account_id: emailAccountId,
        subscription_id: validSubs.deletion.id,
        webhook_url: validSubs.deletion.notificationUrl,
        client_state: validSubs.deletion.clientState,
        expires_at: validSubs.deletion.expirationDateTime,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }

    if (inserts.length > 0) {
      await supabase
        .from('webhook_subscriptions')
        .upsert(inserts, { 
          onConflict: 'subscription_id',
          ignoreDuplicates: false 
        });
    }

    console.log('✅ Database synced with Microsoft Graph');
  } catch (syncError) {
    console.error('⚠️ Database sync failed:', syncError);
  }
}