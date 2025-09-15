import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GraphService } from '@/lib/microsoftGraph';
import { AIEmailProcessor, EmailContext } from '@/lib/aiProcessor';
import { extractEmailAddress, sanitizeEmailContent, estimateTokens } from '@/lib/utils';

// Safe environment variable access - don't throw during build
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

// Only create Supabase client if env vars are available
const supabase = (supabaseUrl && supabaseServiceKey) ? createClient(
  supabaseUrl,
  supabaseServiceKey
) : null;

export async function POST(request: NextRequest) {
  // Return error if not properly configured
  if (!supabase) {
    return NextResponse.json({ 
      error: 'Service not configured',
      message: 'Environment variables not set'
    }, { status: 503 });
  }

  try {
    console.log('Webhook received - processing email notifications');
    
    const body = await request.json();
    const notifications = body.value;
    
    if (!notifications || !Array.isArray(notifications)) {
      console.error('Invalid webhook payload structure');
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }
    
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
    console.error('Webhook processing error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    // Handle Microsoft Graph webhook validation
    const { searchParams } = new URL(request.url);
    const validationToken = searchParams.get('validationToken');
    
    if (validationToken) {
      console.log('Webhook validation requested');
      return new NextResponse(validationToken, { 
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
    
    // Health check endpoint
    return NextResponse.json({ 
      status: 'OK', 
      endpoint: 'email-webhook',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Webhook GET error:', error);
    return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
  }
}

async function processEmailNotification(notification: any) {
  if (!supabase) {
    console.error('Supabase not configured');
    return;
  }

  try {
    console.log('Processing notification:', {
      resource: notification.resource,
      changeType: notification.changeType,
      clientState: notification.clientState
    });
    
    const { resource, clientState, changeType } = notification;
    
    // Only process new emails
    if (changeType !== 'created') {
      console.log('Skipping non-creation event:', changeType);
      return;
    }
    
    // Find the email account using client state
    const { data: subscription, error: subError } = await supabase
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
      console.error('No active subscription found for client state:', clientState);
      return;
    }

    const emailAccount = subscription.email_accounts;
    if (!emailAccount || !emailAccount.is_active) {
      console.error('Email account not found or inactive');
      return;
    }

    // Extract message ID from resource
    const messageId = resource.split('/').pop();
    if (!messageId) {
      console.error('Could not extract message ID from resource:', resource);
      return;
    }

    // Check if we've already processed this email
    const { data: existingLog } = await supabase
      .from('email_logs')
      .select('id')
      .eq('message_id', messageId)
      .single();

    if (existingLog) {
      console.log('Email already processed:', messageId);
      return;
    }

    // Get email details using Microsoft Graph
    const graphService = new GraphService(emailAccount.access_token);
    const emailDetails = await graphService.getEmailDetails(messageId);

    if (!emailDetails) {
      console.error('Failed to fetch email details for:', messageId);
      return;
    }

    // Log the email in database
    const { data: emailLog, error: logError } = await supabase
      .from('email_logs')
      .insert({
        email_account_id: emailAccount.id,
        message_id: messageId,
        subject: emailDetails.subject || '',
        from_email: extractEmailAddress(emailDetails.from),
        body: sanitizeEmailContent(emailDetails.body?.content || ''),
        status: 'received'
      })
      .select()
      .single();

    if (logError) {
      console.error('Failed to log email:', logError);
      return;
    }

    // Generate AI response and create draft (only if API key is available)
    if (anthropicApiKey) {
      await generateAndCreateDraftReply(graphService, emailDetails, emailAccount, emailLog.id);
    } else {
      console.log('Anthropic API key not configured - skipping AI response generation');
    }

  } catch (error) {
    console.error('Error processing email notification:', error);
    
    // Log the error
    try {
      await supabase
        .from('email_logs')
        .insert({
          email_account_id: 'unknown',
          message_id: 'unknown',
          subject: 'Processing Error',
          from_email: 'system',
          body: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          status: 'error'
        });
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
  }
}

async function generateAndCreateDraftReply(
  graphService: GraphService,
  emailDetails: any,
  emailAccount: any,
  emailLogId: string
) {
  if (!supabase || !anthropicApiKey) {
    console.error('Required services not configured');
    return;
  }

  try {
    console.log('Generating AI response for email:', emailDetails.subject);
    
    // Get client template or use defaults
    const { data: template } = await supabase
      .from('email_templates')
      .select('*')
      .eq('client_id', emailAccount.client_id)
      .eq('is_default', true)
      .single();

    const clientTemplate = template || {
      writing_style: 'professional',
      tone: 'friendly',
      signature: emailAccount.clients?.name || 'Best regards',
      sample_emails: []
    };
    
    // Get calendar availability for the next 7 days (optional)
    let calendarAvailability = null;
    try {
      const startTime = new Date().toISOString();
      const endTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      calendarAvailability = await graphService.getCalendarEvents(startTime, endTime);
    } catch (calError: any) {
      console.log('Calendar access not available:', calError.message);
    }
    
    // Prepare context for AI
    const context: EmailContext = {
      subject: emailDetails.subject || '',
      fromEmail: extractEmailAddress(emailDetails.from),
      body: sanitizeEmailContent(emailDetails.body?.content || ''),
      clientTemplate: {
        writingStyle: clientTemplate.writing_style,
        tone: clientTemplate.tone,
        signature: clientTemplate.signature,
        sampleEmails: clientTemplate.sample_emails || []
      },
      calendarAvailability: calendarAvailability?.value || null
    };
    
    // Generate AI response
    const aiProcessor = new AIEmailProcessor(anthropicApiKey);
    const aiResponse = await aiProcessor.generateResponse(context);
    
    console.log('AI response generated, length:', aiResponse.length);
    
    // Create draft reply in Outlook
    const draftReply = await graphService.createDraftReply(
      emailDetails.id,
      aiResponse,
      false // Set to true for reply-all
    );
    
    console.log('Draft reply created:', draftReply?.id);
    
    // Update the email log with the AI response and success status
    const { error: updateError } = await supabase
      .from('email_logs')
      .update({
        ai_response: aiResponse,
        status: 'draft_created',
        tokens_used: estimateTokens(aiResponse)
      })
      .eq('id', emailLogId);
      
    if (updateError) {
      console.error('Failed to update email log:', updateError);
    }
    
    console.log('Email processing completed successfully');
    
  } catch (error) {
    console.error('Error generating AI response:', error);
    
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