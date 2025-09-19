// Enhanced: src/app/api/webhooks/email-received/route.ts
// Added intelligent delay system for natural notification flow

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GraphService } from '@/lib/microsoftGraph';
import { AIEmailProcessor, EmailContext } from '@/lib/aiProcessor';
import { extractEmailAddress, sanitizeEmailContent, estimateTokens } from '@/lib/utils';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

const supabase = (supabaseUrl && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// Enhanced duplicate prevention with action-specific caching
const processingCache = new Map<string, { timestamp: number; action: string }>();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

// 🚀 NEW: Scheduled AI processing queue
const scheduledProcessing = new Map<string, NodeJS.Timeout>();

// Clean up cache and scheduled tasks periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of processingCache.entries()) {
    if (now - data.timestamp > CACHE_DURATION) {
      processingCache.delete(key);
    }
  }
  
  // Clean up expired scheduled tasks
  for (const [key, timeout] of scheduledProcessing.entries()) {
    const parts = key.split('-');
    const timestamp = parseInt(parts[parts.length - 1]);
    if (now - timestamp > 5 * 60 * 1000) { // 5 minutes old
      clearTimeout(timeout);
      scheduledProcessing.delete(key);
    }
  }
}, 60000);

export async function POST(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json(
      { error: 'Service not configured', message: 'Environment variables not set' },
      { status: 503 }
    );
  }

  try {
    // Handle validation requests
    const url = new URL(request.url);
    const validationToken = url.searchParams.get('validationToken');
    
    if (validationToken) {
      console.log('📧 Webhook validation request received');
      return new NextResponse(validationToken, {
        status: 200,
        headers: { 
          'Content-Type': 'text/plain',
          'Content-Length': validationToken.length.toString()
        }
      });
    }

    console.log('📧 Webhook notification received');

    const body = await request.json();
    const notifications = body.value;

    if (!notifications || !Array.isArray(notifications)) {
      console.error('❌ Invalid webhook payload structure');
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    console.log(`📧 Processing ${notifications.length} notifications`);

    // Process notifications with enhanced filtering and delay
    const results = [];
    for (const notification of notifications) {
      const result = await processEmailNotificationWithDelay(notification);
      results.push(result);
    }

    return NextResponse.json({
      status: 'processed',
      count: notifications.length,
      processed: results.filter(r => r.status === 'pending_delayed' || r.status === 'success').length,
      scheduled: results.filter(r => r.status === 'pending_delayed').length,
      skipped: results.filter(r => r.status?.includes('skipped') || r.status?.includes('duplicate')).length,
      errors: results.filter(r => r.status === 'error').length,
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const validationToken = searchParams.get('validationToken');

    if (validationToken) {
      console.log('📧 Webhook validation via GET');
      return new NextResponse(validationToken, {
        status: 200,
        headers: { 
          'Content-Type': 'text/plain',
          'Content-Length': validationToken.length.toString()
        }
      });
    }

    return NextResponse.json({
      status: 'OK',
      endpoint: 'email-webhook-with-delay',
      timestamp: new Date().toISOString(),
      message: 'Enhanced webhook endpoint ready with notification-preserving delays',
      cacheSize: processingCache.size,
      scheduledTasks: scheduledProcessing.size,
      activeCacheEntries: Array.from(processingCache.entries()).map(([key, data]) => ({
        id: key.substring(0, 20) + '...',
        age: Math.round((Date.now() - data.timestamp) / 1000) + 's',
        action: data.action
      }))
    });
  } catch (error) {
    console.error('❌ Webhook GET error:', error);
    return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
  }
}

/**
 * 🚀 ENHANCED: Process notifications with intelligent delay for natural notifications
 */
async function processEmailNotificationWithDelay(notification: any): Promise<any> {
  try {
    const { resource, clientState, changeType, resourceData } = notification;

    console.log('🔍 Analyzing notification:', {
      changeType,
      resource: resource?.substring(0, 50) + '...',
      clientState: clientState?.substring(0, 20) + '...',
      hasResourceData: !!resourceData
    });

    // CRITICAL FILTER 1: Only process 'created' notifications
    if (changeType !== 'created') {
      console.log(`⏭️ Ignoring ${changeType} notification (not a new email creation)`);
      return { 
        status: 'skipped_by_design', 
        reason: `Ignoring ${changeType} event - only processing created emails`,
        changeType 
      };
    }

    // CRITICAL FILTER 2: Validate resource path (Microsoft Graph sends different formats)
    // Subscription: /me/mailFolders('Inbox')/messages 
    // Notification: Users/{userId}/Messages/{messageId}
    const isMessageResource = resource && (
      resource.includes('Messages') ||  // Handles: Users/.../Messages/...
      resource.includes('messages') ||  // Handles: /me/.../messages
      resource.includes('/messages/') ||
      resource.includes('/Messages/')
    );

    if (!isMessageResource) {
      console.log('⏭️ Notification not a message resource:', resource);
      return { 
        status: 'skipped_by_design', 
        reason: 'Not a message resource',
        resource: resource?.substring(0, 100) + '...'
      };
    }

    console.log('✅ Message resource validated:', resource?.substring(0, 80) + '...');

    // Extract message ID
    const messageId = resource.split('/').pop();
    if (!messageId || messageId.length < 10) {
      console.error('❌ Invalid message ID:', messageId);
      return { status: 'error', reason: 'Invalid message ID', messageId };
    }

    // ENHANCED FILTER 3: Multi-layered duplicate prevention
    const cacheKey = `${messageId}-${clientState}`;
    const existingEntry = processingCache.get(cacheKey);
    
    if (existingEntry) {
      const ageMinutes = Math.round((Date.now() - existingEntry.timestamp) / 1000 / 60);
      console.log(`🚫 Recently processed email (${ageMinutes}m ago):`, messageId);
      return { 
        status: 'duplicate_prevented_cache', 
        reason: `Processed ${ageMinutes} minutes ago`,
        messageId: messageId.substring(0, 15) + '...',
        previousAction: existingEntry.action
      };
    }

    // Mark as being processed
    processingCache.set(cacheKey, { timestamp: Date.now(), action: 'webhook_received' });

    // ENHANCED FILTER 4: Database duplicate check
    const { data: existingLog, error: checkError } = await supabase!
      .from('email_logs')
      .select('id, status, created_at, ai_response')
      .eq('message_id', messageId)
      .maybeSingle();

    if (checkError) {
      console.error('❌ Database check error:', checkError);
      processingCache.delete(cacheKey);
      return { status: 'error', reason: 'Database error', messageId: messageId.substring(0, 15) + '...' };
    }

    if (existingLog) {
      const existingAge = Math.round((Date.now() - new Date(existingLog.created_at).getTime()) / 1000 / 60);
      console.log(`🚫 Email already in database (${existingAge}m ago, status: ${existingLog.status}):`, messageId);
      processingCache.delete(cacheKey);
      return { 
        status: 'duplicate_prevented_database',
        reason: `Already processed ${existingAge} minutes ago`,
        messageId: messageId.substring(0, 15) + '...',
        existingStatus: existingLog.status,
        hasAiResponse: !!existingLog.ai_response
      };
    }

    // Find subscription and email account
    const { data: subscription, error: subError } = await supabase!
      .from('webhook_subscriptions')
      .select(`
        *,
        email_accounts (
          *,
          clients (*)
        )
      `)
      .eq('client_state', clientState)
      .eq('is_active', true)
      .single();

    if (subError || !subscription) {
      console.error('❌ No active subscription found:', clientState);
      processingCache.delete(cacheKey);
      return { status: 'error', reason: 'No subscription', clientState: clientState?.substring(0, 20) + '...' };
    }

    const emailAccount = subscription.email_accounts;
    if (!emailAccount?.is_active) {
      console.error('❌ Email account inactive');
      processingCache.delete(cacheKey);
      return { status: 'error', reason: 'Account inactive' };
    }

    console.log('✅ Email passed all validation checks, preparing for DELAYED processing:', messageId);

    // Atomic database insert to claim processing rights
    const { data: emailLog, error: logError } = await supabase!
      .from('email_logs')
      .insert({
        email_account_id: emailAccount.id,
        message_id: messageId,
        subject: 'Processing Scheduled...',
        sender_email: 'system@delayed',
        original_body: 'Email scheduled for delayed AI processing to preserve notifications...',
        status: 'pending', // Use existing allowed status instead of 'scheduled'
        tokens_used: 0,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (logError) {
      if (logError.code === '23505') { // Unique constraint violation
        console.log('⏭️ Race condition detected - another process claimed this email');
        processingCache.delete(cacheKey);
        return { 
          status: 'duplicate_prevented_race', 
          reason: 'Another process is handling this email',
          messageId: messageId.substring(0, 15) + '...'
        };
      }
      console.error('❌ Database insert failed:', logError);
      processingCache.delete(cacheKey);
      return { status: 'error', reason: 'Database insert failed', messageId: messageId.substring(0, 15) + '...' };
    }

    // 🚀 SCHEDULE DELAYED AI PROCESSING
    const delayMs = getProcessingDelay(emailAccount.client_id);
    console.log(`⏰ Scheduling AI processing in ${delayMs/1000} seconds to preserve notifications...`);
    
    const timeoutId = setTimeout(async () => {
      try {
        console.log(`🚀 Starting delayed AI processing for: ${messageId}`);
        // Pass the full email account data and all needed info
        await processEmailWithAI(messageId, emailAccount, emailLog.id, clientState);
      } catch (delayedError) {
        console.error('❌ Delayed processing error:', delayedError);
        await updateEmailLogStatus(emailLog.id, 'error', `Delayed processing failed: ${delayedError instanceof Error ? delayedError.message : 'Unknown error'}`);
      } finally {
        // Clean up scheduled task
        scheduledProcessing.delete(cacheKey);
        processingCache.set(cacheKey, { timestamp: Date.now(), action: 'delayed_processing_completed' });
      }
    }, delayMs);

    // Track the scheduled task
    scheduledProcessing.set(cacheKey, timeoutId);

    return { 
      status: 'pending_delayed', 
      reason: `AI processing scheduled in ${delayMs/1000} seconds (status: pending)`,
      messageId: messageId.substring(0, 15) + '...',
      delaySeconds: delayMs / 1000,
      scheduledAt: new Date(Date.now() + delayMs).toISOString()
    };

  } catch (error) {
    console.error('❌ Notification processing error:', error);
    return { 
      status: 'error', 
      reason: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * 🎯 Get processing delay based on client settings or default
 */
function getProcessingDelay(clientId: string): number {
  // Default delay: 45-60 seconds (randomized to avoid patterns)
  const baseDelay = 45 * 1000; // 45 seconds
  const randomExtra = Math.random() * 15 * 1000; // 0-15 seconds extra
  
  // TODO: Could be made configurable per client in database
  // For now, use consistent delay to preserve notifications
  
  return baseDelay + randomExtra; // 45-60 seconds
}

/**
 * 🤖 Process email with AI after delay
 */
async function processEmailWithAI(messageId: string, emailAccount: any, emailLogId: string, clientState?: string) {
  if (!supabase || !anthropicApiKey) {
    console.error('❌ Required services not configured');
    await updateEmailLogStatus(emailLogId, 'error', 'Required services not configured');
    return;
  }

  try {
    console.log('🤖 Starting AI processing for delayed email:', messageId);
    console.log('📧 Email account info:', {
      id: emailAccount.id,
      email: emailAccount.email_address,
      client_id: emailAccount.client_id,
      is_active: emailAccount.is_active
    });

    // Validate email account
    if (!emailAccount || !emailAccount.id || !emailAccount.is_active) {
      throw new Error(`Email account validation failed: ${JSON.stringify(emailAccount)}`);
    }

    // Initialize Graph service
    const { getValidAccessToken } = await import('@/lib/tokenRefresh');
    const validToken = await getValidAccessToken(emailAccount.id);
    const graphService = new GraphService(validToken);

    // Fetch email details (read-only operation)
    const emailDetails = await graphService.getEmailDetailsPreservingNotifications(messageId);
    
    if (!emailDetails) {
      await updateEmailLogStatus(emailLogId, 'error', 'Email not found during delayed processing');
      return;
    }

    console.log('📧 Email details retrieved for delayed processing:', emailDetails.subject);

    // Update log with actual email details
    await supabase!
      .from('email_logs')
      .update({
        subject: emailDetails.subject || 'No subject',
        sender_email: extractEmailAddress(emailDetails.from),
        original_body: sanitizeEmailContent(emailDetails.body?.content || ''),
        status: 'processing',
        updated_at: new Date().toISOString()
      })
      .eq('id', emailLogId);

    // Generate AI response and create draft using the ORIGINAL working function
    const aiResult = await generateAndCreateDraftReplyDelayed(
      emailDetails,
      emailAccount,
      emailLogId,
      graphService
    );

    console.log('🎉 Delayed AI processing completed successfully with result:', aiResult);
    
  } catch (error) {
    console.error('❌ Delayed AI processing error:', error);
    await updateEmailLogStatus(emailLogId, 'error', `Delayed processing error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function updateEmailLogStatus(logId: string, status: string, aiResponse?: string) {
  try {
    await supabase!
      .from('email_logs')
      .update({
        status,
        ai_response: aiResponse,
        updated_at: new Date().toISOString()
      })
      .eq('id', logId);
  } catch (error) {
    console.error('❌ Failed to update email log:', error);
  }
}

async function generateAndCreateDraftReplyDelayed(
  emailDetails: any,
  emailAccount: any,
  emailLogId: string,
  graphService: any
): Promise<void> {
  if (!supabase || !anthropicApiKey) {
    return;
  }

  try {
    console.log('🤖 Generating delayed AI response for:', emailDetails.subject);

    // Get client template settings
    const { data: template } = await supabase
      .from('email_templates')
      .select('*')
      .eq('client_id', emailAccount.client_id)
      .eq('name', 'Default Template')
      .single();

    const clientTemplate = {
      writingStyle: template?.writing_style || 'professional',
      tone: template?.tone || 'friendly',
      signature: template?.signature || `Best regards,\n${emailAccount.clients?.name || ''}`,
      sampleEmails: template?.sample_emails || [],
      autoResponse: template?.auto_response !== false,
      responseDelay: template?.response_delay || 0
    };

    if (!clientTemplate.autoResponse) {
      await updateEmailLogStatus(emailLogId, 'skipped', 'Auto-response disabled');
      return;
    }

    // Generate AI response
    const aiProcessor = new AIEmailProcessor(anthropicApiKey);
    const context: EmailContext = {
      subject: emailDetails.subject || '',
      fromEmail: extractEmailAddress(emailDetails.from),
      body: sanitizeEmailContent(emailDetails.body?.content || ''),
      clientTemplate,
      conversationHistory: '',
      calendarAvailability: null
    };

    const aiResponse = await aiProcessor.generateResponse(context);
    
    // 🚀 Create draft with the FIXED method that preserves unread status
    await graphService.createDraftReply(
      emailDetails.id,
      aiResponse,
      clientTemplate.signature,
      false
    );

    // Update database
    await updateEmailLogStatus(emailLogId, 'draft_created', aiResponse);
    
    console.log('✅ Delayed draft created successfully with notifications preserved');

  } catch (error) {
    console.error('❌ Delayed AI processing error:', error);
    await updateEmailLogStatus(emailLogId, 'error', `Delayed AI error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
}