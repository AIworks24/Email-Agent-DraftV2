// Enhanced: src/app/api/webhooks/email-received/route.ts
// Fixed threading and signature handling

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

export async function POST(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json(
      {
        error: 'Service not configured',
        message: 'Environment variables not set'
      },
      { status: 503 }
    );
  }

  try {
    // Check if this is a validation request
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

    console.log('📧 Webhook notification received - processing email notifications');

    const body = await request.json();
    const notifications = body.value;

    if (!notifications || !Array.isArray(notifications)) {
      console.error('❌ Invalid webhook payload structure');
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    console.log(`📧 Processing ${notifications.length} notifications`);

    // Process each notification
    for (const notification of notifications) {
      await processEmailNotification(notification);
    }

    return NextResponse.json({
      status: 'processed',
      count: notifications.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const validationToken = searchParams.get('validationToken');

    if (validationToken) {
      console.log('📧 Webhook validation via GET requested');
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
      endpoint: 'email-webhook',
      timestamp: new Date().toISOString(),
      message: 'Webhook endpoint is ready to receive notifications'
    });
  } catch (error) {
    console.error('❌ Webhook GET error:', error);
    return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
  }
}

async function processEmailNotification(notification: any) {
  if (!supabase) {
    console.error('❌ Supabase not configured');
    return;
  }

  try {
    console.log('🔄 Processing notification:', {
      resource: notification.resource,
      changeType: notification.changeType,
      clientState: notification.clientState
    });

    const { resource, clientState, changeType } = notification;

    // Only process new emails
    if (changeType !== 'created') {
      console.log('⏭️ Skipping non-creation event:', changeType);
      return;
    }

    // Find the email account using client state
    const { data: subscription, error: subError } = await supabase
      .from('webhook_subscriptions')
      .select(
        `
        *,
        email_accounts (
          *,
          clients (*)
        )
      `
      )
      .eq('client_state', clientState)
      .eq('is_active', true)
      .single();

    if (subError || !subscription) {
      console.error('❌ No active subscription found for client state:', clientState);
      return;
    }

    const emailAccount = subscription.email_accounts;
    if (!emailAccount || !emailAccount.is_active) {
      console.error('❌ Email account not found or inactive');
      return;
    }

    // Extract message ID from resource
    const messageId = resource.split('/').pop();
    if (!messageId) {
      console.error('❌ Could not extract message ID from resource:', resource);
      return;
    }

    console.log('📧 Processing email ID:', messageId);

    // Atomic check and insert to prevent duplicates
    const { data: emailLog, error: logError } = await supabase
      .from('email_logs')
      .insert({
        email_account_id: emailAccount.id,
        message_id: messageId,
        subject: 'Loading...',
        sender_email: 'system@processing.temp',
        original_body: 'Fetching email details...',
        status: 'pending',
        tokens_used: 0
      })
      .select()
      .single();

    if (logError) {
      // If insert fails due to duplicate, exit silently
      if (logError.code === '23505') { // Unique constraint violation
        console.log('⏭️ Email already being processed:', messageId);
        return;
      }
      console.error('❌ Failed to log email:', logError);
      return;
    }

    console.log('✅ Email processing started:', messageId);

    // Get email details using Microsoft Graph with token refresh
    let graphService;
    try {
      const { getValidAccessToken } = await import('@/lib/tokenRefresh');
      const validToken = await getValidAccessToken(emailAccount.id);
      graphService = new GraphService(validToken);
    } catch (tokenError) {
      console.error('❌ Token refresh failed:', tokenError);
      // Mark email as error due to token issues
      await supabase
        .from('email_logs')
        .update({ 
          status: 'error', 
          ai_response: 'Token refresh failed - client needs to re-authenticate' 
        })
        .eq('id', emailLog.id);
      return;
    }

    let emailDetails;
    try {
      emailDetails = await graphService.getEmailDetails(messageId);
    } catch (graphError) {
      console.error('❌ Failed to fetch email details:', graphError);
      await supabase
        .from('email_logs')
        .update({ 
          status: 'error', 
          ai_response: 'Failed to fetch email details from Microsoft Graph' 
        })
        .eq('id', emailLog.id);
      return;
    }

    if (!emailDetails) {
      console.error('❌ Email details not found for:', messageId);
      await supabase
        .from('email_logs')
        .update({ 
          status: 'error', 
          ai_response: 'Email not found' 
        })
        .eq('id', emailLog.id);
      return;
    }

    console.log('📧 Email details fetched:', emailDetails.subject);

    // Update with actual email details
    await supabase
      .from('email_logs')
      .update({
        subject: emailDetails.subject || '',
        sender_email: extractEmailAddress(emailDetails.from),
        original_body: sanitizeEmailContent(emailDetails.body?.content || ''),
        status: 'processing'
      })
      .eq('id', emailLog.id);

    // Generate AI response and create draft (only if API key is available)
    if (anthropicApiKey) {
      await generateAndCreateDraftReply(
        emailDetails,
        emailAccount,
        emailLog.id,
        graphService
      );
    } else {
      console.log('⚠️ Anthropic API key not configured - skipping AI response generation');
      await supabase
        .from('email_logs')
        .update({
          status: 'skipped',
          ai_response: 'AI response generation disabled - API key not configured'
        })
        .eq('id', emailLog.id);
    }
  } catch (error) {
    console.error('❌ Error processing email notification:', error);

    // Log the error
    try {
      await supabase
        ?.from('email_logs')
        .insert({
          email_account_id: 'unknown',
          message_id: 'unknown',
          subject: 'Processing Error',
          sender_email: 'system',
          original_body: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          status: 'error'
        });
    } catch (logError) {
      console.error('❌ Failed to log error:', logError);
    }
  }
}

async function getClientTemplate(clientId: string) {
  try {
    if (!supabase) return null;

    // Get client info
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name, email')
      .eq('id', clientId)
      .single();

    if (clientError) {
      console.error('❌ Failed to get client:', clientError);
      return null;
    }

    // Get email template settings
    const { data: template } = await supabase
      .from('email_templates')
      .select('*')
      .eq('client_id', clientId)
      .eq('name', 'Default Template')
      .single();

    // Return template with defaults
    return {
      writingStyle: template?.writing_style || 'professional',
      tone: template?.tone || 'friendly',
      signature: template?.signature || `Best regards,\n${client?.name || ''}`,
      sampleEmails: template?.sample_emails || [],
      autoResponse: template?.auto_response !== false,
      responseDelay: template?.response_delay || 0
    };
  } catch (error) {
    console.error('❌ Error getting client template:', error);
    return {
      writingStyle: 'professional',
      tone: 'friendly',
      signature: 'Best regards',
      sampleEmails: [],
      autoResponse: true,
      responseDelay: 0
    };
  }
}

async function generateAndCreateDraftReply(
  emailDetails: any,
  emailAccount: any,
  emailLogId: string,
  graphService: any
) {
  if (!supabase || !anthropicApiKey) {
    console.error('❌ Required services not configured');
    return;
  }

  try {
    console.log('🤖 Generating AI response for email:', emailDetails.subject);

    // Get client template with settings from database
    const clientTemplate = await getClientTemplate(emailAccount.client_id);

    if (!clientTemplate) {
      console.error('❌ Client template not available; aborting AI generation');
      await supabase
        .from('email_logs')
        .update({
          status: 'error',
          ai_response: 'Failed to load client settings/template'
        })
        .eq('id', emailLogId);
      return;
    }

    // Check if auto-response is enabled
    if (!clientTemplate.autoResponse) {
      console.log('⏭️ Auto-response disabled for client:', emailAccount.client_id);
      await supabase
        .from('email_logs')
        .update({
          status: 'skipped',
          ai_response: 'Auto-response disabled - requires manual review'
        })
        .eq('id', emailLogId);
      return;
    }

    // Get calendar availability for the next 7 days
    let calendarAvailability: any = null;
    try {
      const startTime = new Date().toISOString();
      const endTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      calendarAvailability = await graphService.getCalendarEvents(startTime, endTime);
    } catch (calError: any) {
      console.log('⚠️ Calendar access not available:', calError?.message || calError);
    }

    // Get conversation history for proper threading
    const aiProcessor = new AIEmailProcessor(anthropicApiKey);
    let conversationHistory = '';
    try {
      conversationHistory = await aiProcessor.getConversationHistory(emailDetails.id, graphService);
    } catch (historyError) {
      console.log('⚠️ Could not get conversation history:', historyError);
    }

    // Prepare context using client's personalized settings
    const context: EmailContext = {
      subject: emailDetails.subject || '',
      fromEmail: extractEmailAddress(emailDetails.from),
      body: sanitizeEmailContent(emailDetails.body?.content || ''),
      conversationHistory: conversationHistory,
      originalMessage: emailDetails, // Pass full message for threading
      clientTemplate: {
        writingStyle: clientTemplate.writingStyle,
        tone: clientTemplate.tone,
        signature: clientTemplate.signature,
        sampleEmails: clientTemplate.sampleEmails
      },
      calendarAvailability: calendarAvailability?.value || null
    };

    // Generate AI response (without signature - it will be added by Graph service)
    const aiResponse = await aiProcessor.generateResponse(context);
    console.log('🤖 AI response generated using client preferences');

    // Create draft reply in Outlook with proper threading and signature
    const draftReply = await graphService.createDraftReply(
      emailDetails.id,
      aiResponse,
      clientTemplate.signature, // Pass signature separately
      false // Reply to sender only, not reply-all
    );

    console.log('✅ Draft reply created with threading and signature:', draftReply?.id);

    // Log successful processing
    await supabase
      .from('email_logs')
      .update({
        ai_response: aiResponse,
        status: 'draft_created',
        tokens_used: estimateTokens(aiResponse)
      })
      .eq('id', emailLogId);

    console.log('🎉 Email processing completed with personalized AI response');
  } catch (error) {
    console.error('❌ Error generating personalized AI response:', error);

    // Update status to error
    await supabase
      .from('email_logs')
      .update({
        status: 'error',
        ai_response: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      })
      .eq('id', emailLogId);
  }
}