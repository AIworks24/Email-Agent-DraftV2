// Create new file: src/app/api/webhooks/email-deleted/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GraphService } from '@/lib/microsoftGraph';
import { getValidAccessToken } from '@/lib/tokenRefresh';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = (supabaseUrl && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// Track processed delete notifications to prevent duplicates
const deleteProcessingCache = new Map<string, number>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Clean cache periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of deleteProcessingCache.entries()) {
    if (now - timestamp > CACHE_DURATION) {
      deleteProcessingCache.delete(key);
    }
  }
}, 60000);

export async function POST(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json(
      { error: 'Service not configured' },
      { status: 503 }
    );
  }

  try {
    // Handle validation requests
    const url = new URL(request.url);
    const validationToken = url.searchParams.get('validationToken');
    
    if (validationToken) {
      console.log('🗑️ Delete webhook validation request received');
      return new NextResponse(validationToken, {
        status: 200,
        headers: { 
          'Content-Type': 'text/plain',
          'Content-Length': validationToken.length.toString()
        }
      });
    }

    console.log('🗑️ Email delete webhook notification received');

    const body = await request.json();
    const notifications = body.value;

    if (!notifications || !Array.isArray(notifications)) {
      console.error('❌ Invalid delete webhook payload structure');
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    console.log(`🗑️ Processing ${notifications.length} delete notifications`);

    const results = [];
    for (const notification of notifications) {
      const result = await processEmailDeleteNotification(notification);
      results.push(result);
    }

    return NextResponse.json({
      status: 'processed',
      count: notifications.length,
      deleted: results.filter(r => r.status === 'draft_deleted').length,
      skipped: results.filter(r => r.status?.includes('skipped')).length,
      errors: results.filter(r => r.status === 'error').length,
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Delete webhook processing error:', error);
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
      console.log('🗑️ Delete webhook validation via GET');
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
      endpoint: 'email-delete-webhook',
      timestamp: new Date().toISOString(),
      message: 'Email deletion tracking webhook ready',
      cacheSize: deleteProcessingCache.size
    });
  } catch (error) {
    console.error('❌ Delete webhook GET error:', error);
    return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
  }
}

/**
 * Process email deletion notification and delete associated AI draft
 */
async function processEmailDeleteNotification(notification: any): Promise<any> {
  try {
    const { resource, clientState, changeType } = notification;

    console.log('🔍 Analyzing delete notification:', {
      changeType,
      resource: resource?.substring(0, 50) + '...',
      clientState: clientState?.substring(0, 20) + '...'
    });

    // Only process 'deleted' notifications
    if (changeType !== 'deleted') {
      console.log(`⏭️ Ignoring ${changeType} notification (not a deletion)`);
      return { 
        status: 'skipped_by_design', 
        reason: `Ignoring ${changeType} event - only processing deletions`,
        changeType 
      };
    }

    // Extract message ID from resource path
    const messageId = resource.split('/').pop();
    if (!messageId || messageId.length < 10) {
      console.error('❌ Invalid message ID in delete notification:', messageId);
      return { status: 'error', reason: 'Invalid message ID', messageId };
    }

    // Check cache to prevent duplicate processing
    const cacheKey = `${messageId}-delete`;
    if (deleteProcessingCache.has(cacheKey)) {
      console.log('🚫 Delete notification already processed:', messageId);
      return { 
        status: 'duplicate_prevented', 
        reason: 'Already processed',
        messageId: messageId.substring(0, 15) + '...'
      };
    }

    deleteProcessingCache.set(cacheKey, Date.now());

    // Find email log entry with associated draft
    const { data: emailLog, error: logError } = await supabase!
      .from('email_logs')
      .select(`
        *,
        email_accounts (
          *,
          clients (*)
        )
      `)
      .eq('message_id', messageId)
      .eq('status', 'draft_created')
      .not('draft_message_id', 'is', null)
      .eq('is_draft_deleted', false)
      .single();

    if (logError || !emailLog) {
      console.log('⏭️ No AI draft found for deleted email:', messageId);
      return { 
        status: 'skipped_no_draft', 
        reason: 'No associated AI draft found',
        messageId: messageId.substring(0, 15) + '...'
      };
    }

    const emailAccount = emailLog.email_accounts;
    const draftMessageId = emailLog.draft_message_id;

    console.log('🎯 Found AI draft to delete:', {
      originalMessageId: messageId.substring(0, 15) + '...',
      draftMessageId: draftMessageId?.substring(0, 15) + '...',
      client: emailAccount.clients?.name
    });

    try {
      // Get valid access token and create Graph service
      const validToken = await getValidAccessToken(emailAccount.id);
      const graphService = new GraphService(validToken);

      // Delete the AI-generated draft
      await graphService.deleteDraft(draftMessageId);

      // Update database to mark draft as deleted
      await supabase!
        .from('email_logs')
        .update({
          is_draft_deleted: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', emailLog.id);

      console.log('✅ AI draft deleted successfully:', draftMessageId?.substring(0, 15) + '...');

      return {
        status: 'draft_deleted',
        reason: 'AI draft auto-deleted when original email was deleted',
        originalMessageId: messageId.substring(0, 15) + '...',
        draftMessageId: draftMessageId?.substring(0, 15) + '...',
        client: emailAccount.clients?.name
      };

    } catch (deleteError) {
      console.error('❌ Failed to delete AI draft:', deleteError);

      // Still mark as processed to avoid retries, but log the error
      await supabase!
        .from('email_logs')
        .update({
          is_draft_deleted: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', emailLog.id);

      return {
        status: 'delete_failed',
        reason: 'Failed to delete AI draft but marked as processed',
        error: deleteError instanceof Error ? deleteError.message : 'Unknown error',
        originalMessageId: messageId.substring(0, 15) + '...',
        draftMessageId: draftMessageId?.substring(0, 15) + '...'
      };
    }

  } catch (error) {
    console.error('❌ Delete notification processing error:', error);
    return { 
      status: 'error', 
      reason: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}