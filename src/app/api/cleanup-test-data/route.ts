// Create: src/app/api/cleanup-test-data/route.ts
// Clean up old test/processing entries

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST() {
  try {
    console.log('🧹 Starting cleanup of test/processing data...');

    // Delete old processing entries that never completed
    const { error: processingError, count: processingCount } = await supabase
      .from('email_logs')
      .delete({ count: 'exact' })
      .or('sender_email.eq.processing@temp.com,sender_email.eq.system@processing.temp,subject.eq.Processing...,subject.eq.Loading...')
      .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // Older than 24 hours

    // Delete error entries that are from testing
    const { error: errorError, count: errorCount } = await supabase
      .from('email_logs')
      .delete({ count: 'exact' })
      .eq('status', 'error')
      .lt('created_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()); // Older than 6 hours

    // Clean up duplicate processing entries (same message_id, keep newest)
    const { data: duplicates } = await supabase
      .from('email_logs')
      .select('message_id, id, created_at')
      .not('message_id', 'is', null);

    if (duplicates) {
      const messageGroups = duplicates.reduce((groups: any, item) => {
        if (!groups[item.message_id]) {
          groups[item.message_id] = [];
        }
        groups[item.message_id].push(item);
        return groups;
      }, {});

      let duplicateCount = 0;
      for (const [messageId, items] of Object.entries(messageGroups) as [string, any[]][]) {
        if (items.length > 1) {
          // Keep the newest, delete the rest
          const sorted = items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          const toDelete = sorted.slice(1);
          
          for (const item of toDelete) {
            await supabase
              .from('email_logs')
              .delete()
              .eq('id', item.id);
            duplicateCount++;
          }
        }
      }

      console.log(`🗑️ Removed ${duplicateCount} duplicate entries`);
    }

    const summary = {
      processingEntriesDeleted: processingCount || 0,
      errorEntriesDeleted: errorCount || 0,
      duplicatesDeleted: duplicates ? 'cleaned' : 0,
      message: 'Cleanup completed successfully',
      timestamp: new Date().toISOString()
    };

    console.log('✅ Cleanup summary:', summary);

    return NextResponse.json(summary);

  } catch (error) {
    console.error('❌ Cleanup error:', error);
    return NextResponse.json({ 
      error: 'Cleanup failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}