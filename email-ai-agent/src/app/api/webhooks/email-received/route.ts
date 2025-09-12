import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GraphService } from '@/lib/microsoftGraph';
import { AIEmailProcessor, EmailContext } from '@/lib/aiProcessor';

// Initialize Supabase with service role key for server-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
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
    
    // Find the email account using clientState (which should be the email address)
    const { data: emailAccount, error: accountError } = await supabase
      .from('email_accounts')
      .select(`
        *,
        clients(*),
        email_templates(*)
      `)
      .eq('email_address', clientState)
      .eq('is_active', true)
      .single();
      
    if (accountError || !emailAccount) {
      console.error('Email account not found:', clientState, accountError);
      return;
    }
    
    console.log('Found email account for:', emailAccount.email_address);
    
    // Initialize Graph Service with stored access token
    const graphService = new GraphService(emailAccount.access_token);
    
    // Extract message ID from resource path
    // Resource format: /me/messages/{messageId}
    const messageId = resource.split('/').pop();
    
    if (!messageId) {
      console.error('Could not extract message ID from resource:', resource);
      return;
    }
    
    // Get the full email details
    const emailDetails = await graphService.getEmailDetails(messageId);
    
    if (!emailDetails) {
      console.error('Could not retrieve email details for message:', messageId);
      return;
    }
    
    console.log('Retrieved email:', {
      subject: emailDetails.subject,
      from: emailDetails.from?.emailAddress?.address,
      id: emailDetails.id
    });
    
    // Skip if this is an email we sent (to avoid loops)
    if (emailDetails.from?.emailAddress?.address === emailAccount.email_address) {
      console.log('Skipping self-sent email');
      return;
    }
    
    // Log the email in our database
    const { data: emailLog, error: logError } = await supabase
      .from('email_logs')
      .insert({
        email_account_id: emailAccount.id,
        subject: emailDetails.subject || 'No Subject',
        sender_email: emailDetails.from?.emailAddress?.address || 'Unknown',
        original_body: emailDetails.body?.content || '',
        status: 'pending'
      })
      .select()
      .single();
      
    if (logError || !emailLog) {
      console.error('Failed to log email:', logError);
      return;
    }
    
    // Generate AI response
    await generateAndCreateDraftReply(
      graphService,
      emailDetails,
      emailAccount,
      emailLog.id
    );
    
  } catch (error) {
    console.error('Error processing email notification:', error);
    
    // Log the error to database if possible
    try {
      await supabase
        .from('email_logs')
        .insert({
          email_account_id: 'error',
          subject: 'Processing Error',
          sender_email: 'system',
          original_body: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
  try {
    console.log('Generating AI response for email:', emailDetails.subject);
    
    // Get client template or use defaults
    const template = emailAccount.email_templates?.[0] || {
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
    } catch (calError) {
      console.log('Calendar access not available:', calError.message);
    }
    
    // Prepare context for AI
    const context: EmailContext = {
      subject: emailDetails.subject || '',
      fromEmail: emailDetails.from?.emailAddress?.address || '',
      body: emailDetails.body?.content || '',
      clientTemplate: {
        writingStyle: template.writing_style,
        tone: template.tone,
        signature: template.signature,
        sampleEmails: template.sample_emails || []
      },
      calendarAvailability: calendarAvailability?.value || null
    };
    
    // Generate AI response
    const aiProcessor = new AIEmailProcessor(process.env.ANTHROPIC_API_KEY!);
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
        tokens_used: estimateTokens(aiResponse) // Rough estimate
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

// Simple token estimation (roughly 4 characters per token)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Handle OPTIONS request for CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}