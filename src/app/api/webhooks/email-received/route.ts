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

    console.log('✅ Email passed all validation checks, processing immediately with unread preservation...');

    // Atomic database insert to claim processing rights
    const { data: emailLog, error: logError } = await supabase!
      .from('email_logs')
      .insert({
        email_account_id: emailAccount.id,
        message_id: messageId,
        subject: 'Processing...',
        sender_email: 'system@processing',
        from_email: 'system@processing',
        original_body: 'Processing email with notification preservation...',
        status: 'pending',
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

    // Process immediately but with enhanced unread preservation
    try {
      await processEmailWithAI(messageId, emailAccount, emailLog.id, clientState);
      
      return { 
        status: 'success', 
        reason: 'AI processing completed with notification preservation',
        messageId: messageId.substring(0, 15) + '...'
      };
    } catch (processingError) {
      console.error('❌ Immediate processing error:', processingError);
      await updateEmailLogStatus(emailLog.id, 'error', `Processing failed: ${processingError instanceof Error ? processingError.message : 'Unknown error'}`);
      
      return { 
        status: 'error', 
        reason: 'AI processing failed',
        messageId: messageId.substring(0, 15) + '...',
        error: processingError instanceof Error ? processingError.message : 'Unknown error'
      };
    }

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
    console.log('🤖 Starting AI processing for email:', messageId);

    if (!emailAccount || !emailAccount.id || !emailAccount.is_active) {
      throw new Error(`Invalid email account`);
    }

    const { getValidAccessToken } = await import('@/lib/tokenRefresh');
    const validToken = await getValidAccessToken(emailAccount.id);
    const graphService = new GraphService(validToken);

    console.log('📥 Fetching email details...');
    const emailDetails = await graphService.getEmailDetailsPreservingNotifications(messageId);
    
    if (!emailDetails) {
      console.error('❌ Email not found:', messageId);
      await updateEmailLogStatus(emailLogId, 'error', 'Email not found');
      return;
    }

    const senderEmail = extractEmailAddress(emailDetails.from);
    const emailSubject = emailDetails.subject || 'No subject';
    const emailBody = sanitizeEmailContent(emailDetails.body?.content || '');

    console.log('📧 Extracted data:', {
      sender: senderEmail,
      subject: emailSubject
    });

    console.log('💾 Updating email log with actual details...');
    const { error: updateError } = await supabase!
      .from('email_logs')
      .update({
        subject: emailSubject,
        sender_email: senderEmail,
        from_email: senderEmail,
        original_body: emailBody,
        updated_at: new Date().toISOString()
      })
      .eq('id', emailLogId);

    if (updateError) {
      console.error('❌ Failed to update email log:', updateError);
      throw new Error(`Database update failed: ${updateError.message}`);
    }

    console.log('✅ Email log updated with actual data');

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
      responseDelay: template?.response_delay || 0,
      emailFilters: template?.email_filters || [],
      customInstructions: template?.custom_instructions || '' // ✅ NEW
    };

    if (!clientTemplate.autoResponse) {
      console.log('⏭️ Auto-response disabled');
      await updateEmailLogStatus(emailLogId, 'skipped', 'Auto-response disabled');
      return;
    }

    const normalizedSender = senderEmail.toLowerCase().trim();
    const isFiltered = clientTemplate.emailFilters.some((filterPattern: string) => {
      const normalizedPattern = filterPattern.toLowerCase().trim();
      
      // Skip empty patterns
      if (!normalizedPattern) return false;
      
      // Pattern matching logic:
      // 1. If pattern starts with @, match domain (e.g., @upwork.com)
      // 2. If pattern contains @, match exact email (e.g., spam@test.com)
      // 3. Otherwise, match if pattern appears anywhere in email (e.g., "upwork")
      
      if (normalizedPattern.startsWith('@')) {
        // Domain matching: @email.upwork.com matches any email ending with that domain
        return normalizedSender.endsWith(normalizedPattern);
      } else if (normalizedPattern.includes('@')) {
        // Exact email matching: spam@test.com matches only that exact email
        return normalizedSender === normalizedPattern;
      } else {
        // Substring matching: "upwork" matches any email containing "upwork"
        return normalizedSender.includes(normalizedPattern);
      }
    });

    if (isFiltered) {
      console.log('🚫 Email filtered:', senderEmail);
      await updateEmailLogStatus(emailLogId, 'filtered', `Sender ${senderEmail} is filtered`);
      return;
    }

    // ✅ NEW: Fetch calendar availability for next 7 days
    let calendarAvailability = null;
    try {
      console.log('📅 ========================================');
      console.log('📅 STARTING CALENDAR FETCH 30 days');
      console.log('📅 ========================================');
      
      const startTime = new Date().toISOString();
      const endTime = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      
      console.log('📅 Query parameters:', {
        startTime: new Date(startTime).toLocaleString(),
        endTime: new Date(endTime).toLocaleString()
      });

      console.log('📅 Calling graphService.getCalendarEvents()...');
      const calendarEvents = await graphService.getCalendarEvents(startTime, endTime);
      
      console.log('📅 Raw calendar response:', {
        typeOfResponse: typeof calendarEvents,
        hasValue: !!calendarEvents?.value,
        isArray: Array.isArray(calendarEvents?.value),
        valueLength: calendarEvents?.value?.length,
        responseKeys: Object.keys(calendarEvents || {})
      });

      // Log the raw response structure
      console.log('📅 Full response structure:', JSON.stringify(calendarEvents, null, 2));

      if (calendarEvents && calendarEvents.value && calendarEvents.value.length > 0) {
        calendarAvailability = calendarEvents.value;
        
        console.log('✅ CALENDAR DATA LOADED SUCCESSFULLY!');
        console.log(`   Event count: ${calendarEvents.value.length}`);
        
        // Log each event in detail
        calendarEvents.value.forEach((event: any, index: number) => {
          console.log(`   📅 Event ${index + 1}:`, {
            subject: event.subject || 'No subject',
            start: event.start?.dateTime || event.start?.date,
            end: event.end?.dateTime || event.end?.date,
            isAllDay: event.isAllDay,
            location: event.location?.displayName,
            showAs: event.showAs
          });
        });
        
        console.log('📅 calendarAvailability variable is now:', calendarAvailability);
      } else {
        console.log('📅 No calendar events found (calendar appears empty)');
        console.log('   This could mean:');
        console.log('   1. No events exist in the next 7 days');
        console.log('   2. Events exist but API returned empty');
        console.log('   3. Wrong calendar is being queried');
        calendarAvailability = null;
      }
      
      console.log('📅 ========================================');
      console.log('📅 CALENDAR FETCH COMPLETE');
      console.log('📅 Final calendarAvailability value:', calendarAvailability ? `${calendarAvailability.length} events` : 'null');
      console.log('📅 ========================================');

    } catch (calendarError: any) {
      console.error('❌ ========================================');
      console.error('❌ CALENDAR FETCH ERROR');
      console.error('❌ ========================================');
      console.error('❌ Error type:', calendarError.constructor.name);
      console.error('❌ Error message:', calendarError.message);
      console.error('❌ Error code:', calendarError.code);
      console.error('❌ Status code:', calendarError.statusCode);
      console.error('❌ Full error:', JSON.stringify(calendarError, null, 2));
      console.error('❌ ========================================');
      
      calendarAvailability = null;
    }

    console.log('🤖 About to create AI context...');
    console.log('🤖 calendarAvailability before context creation:', {
      isNull: calendarAvailability === null,
      isUndefined: calendarAvailability === undefined,
      type: typeof calendarAvailability,
      value: calendarAvailability ? `Array with ${calendarAvailability.length} items` : 'null/undefined'
    });

    const aiProcessor = new AIEmailProcessor(anthropicApiKey);
    const context: EmailContext = {
      subject: emailSubject,
      fromEmail: senderEmail,
      body: emailBody,
      clientTemplate,
      conversationHistory: '',
      calendarAvailability // ✅ Passing the variable
    };

    console.log('🤖 Context created. Checking what was passed to AI:');
    console.log('   context.calendarAvailability:', {
      exists: !!context.calendarAvailability,
      type: typeof context.calendarAvailability,
      isArray: Array.isArray(context.calendarAvailability),
      length: context.calendarAvailability?.length || 0,
      firstEvent: context.calendarAvailability?.[0] ? {
        subject: context.calendarAvailability[0].subject,
        start: context.calendarAvailability[0].start?.dateTime
      } : 'No events'
    });

    console.log('🤖 Calling AI processor...');
    const aiResponse = await aiProcessor.generateResponse(context);
    
    const draftResult = await graphService.createDraftReply(
      emailDetails.id,
      aiResponse,
      clientTemplate.signature,
      true
    );

    const { error: finalUpdateError } = await supabase!
      .from('email_logs')
      .update({
        status: 'draft_created',
        ai_response: aiResponse,
        draft_message_id: draftResult.draftId,
        tokens_used: estimateTokens(aiResponse),
        updated_at: new Date().toISOString()
      })
      .eq('id', emailLogId);

    if (finalUpdateError) {
      console.error('❌ Failed to update final status:', finalUpdateError);
    }

    console.log('🎉 Processing completed successfully');

  } catch (error) {
    console.error('❌ AI processing error:', error);
    await updateEmailLogStatus(
      emailLogId, 
      'error', 
      `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
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

    const senderEmail = extractEmailAddress(emailDetails.from);
    console.log('📧 Email from:', senderEmail);

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
      responseDelay: template?.response_delay || 0,
      emailFilters: template?.email_filters || [],
      customInstructions: template?.custom_instructions || '' // ✅ ADD THIS
    };

    if (!clientTemplate.autoResponse) {
      await updateEmailLogStatus(emailLogId, 'skipped', 'Auto-response disabled');
      return;
    }

    const normalizedSender = senderEmail.toLowerCase().trim();
    const isFiltered = clientTemplate.emailFilters.some((filterPattern: string) => {
      const normalizedPattern = filterPattern.toLowerCase().trim();
      
      // Skip empty patterns
      if (!normalizedPattern) return false;
      
      // Pattern matching logic (same as above)
      if (normalizedPattern.startsWith('@')) {
        // Domain matching
        return normalizedSender.endsWith(normalizedPattern);
      } else if (normalizedPattern.includes('@')) {
        // Exact email matching
        return normalizedSender === normalizedPattern;
      } else {
        // Substring matching
        return normalizedSender.includes(normalizedPattern);
      }
    });

    if (isFiltered) {
      console.log('🚫 Email filtered - sender in filter list:', senderEmail);
      await updateEmailLogStatus(emailLogId, 'filtered', `Email filtered - sender ${senderEmail} is in the client's filter list`);
      return;
    }

    // ✅ FIX: Fetch calendar data HERE too!
    let calendarAvailability = null;
    try {
      console.log('📅 Fetching calendar for delayed processing 30 days...');
      const startTime = new Date().toISOString();
      const endTime = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      
      const calendarEvents = await graphService.getCalendarEvents(startTime, endTime);
      
      if (calendarEvents && calendarEvents.value && calendarEvents.value.length > 0) {
        calendarAvailability = calendarEvents.value;
        console.log(`✅ Found ${calendarEvents.value.length} calendar events for delayed processing`);
      } else {
        console.log('📅 No calendar events found');
      }
    } catch (calendarError) {
      console.error('⚠️ Calendar fetch failed:', calendarError);
      calendarAvailability = null;
    }

    console.log('✅ Email passed filter check - proceeding with AI processing');

    const aiProcessor = new AIEmailProcessor(anthropicApiKey);
    const context: EmailContext = {
      subject: emailDetails.subject || '',
      fromEmail: extractEmailAddress(emailDetails.from),
      body: sanitizeEmailContent(emailDetails.body?.content || ''),
      clientTemplate,
      conversationHistory: '',
      calendarAvailability // ✅ CHANGED from null to calendarAvailability variable
    };

    const aiResponse = await aiProcessor.generateResponse(context);
    
    const draftResult = await graphService.createDraftReply(
      emailDetails.id,
      aiResponse,
      clientTemplate.signature,
      true
    );

    const { error: updateError } = await supabase!
      .from('email_logs')
      .update({
        status: 'draft_created',
        ai_response: aiResponse,
        draft_message_id: draftResult.draftId,
        updated_at: new Date().toISOString()
      })
      .eq('id', emailLogId);

    if (updateError) {
      console.error('❌ Failed to update email log with draft ID:', updateError);
    } else {
      console.log('✅ Email log updated with draft tracking ID:', draftResult.draftId);
    }
    
    console.log('✅ Delayed draft created successfully with calendar data and notifications preserved');

  } catch (error) {
    console.error('❌ Delayed AI processing error:', error);
    await updateEmailLogStatus(emailLogId, 'error', `Delayed AI error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
}