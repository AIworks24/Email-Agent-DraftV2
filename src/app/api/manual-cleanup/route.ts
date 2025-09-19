// Create: src/app/api/manual-cleanup/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GraphService } from '@/lib/microsoftGraph';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { action, subscriptionId } = await request.json();
    
    console.log('🧹 Manual cleanup request:', { action, subscriptionId });

    // Get first active email account
    const { data: emailAccount } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('is_active', true)
      .single();

    if (!emailAccount) {
      return NextResponse.json({ 
        success: false, 
        error: 'No active email account found' 
      }, { status: 404 });
    }

    // Get valid token and create Graph service
    const { getValidAccessToken } = await import('@/lib/tokenRefresh');
    const validToken = await getValidAccessToken(emailAccount.id);
    const graphService = new GraphService(validToken);

    if (action === 'delete_specific') {
      console.log(`🗑️ Attempting to delete subscription: ${subscriptionId}`);
      
      try {
        // Use the new public method
        await graphService.deleteSpecificSubscription(subscriptionId);
        
        // Verify deletion by listing remaining subscriptions
        const remainingSubscriptions = await graphService.listAllSubscriptions();
        
        return NextResponse.json({
          success: true,
          message: `Subscription ${subscriptionId} deleted successfully`,
          remainingSubscriptions,
          timestamp: new Date().toISOString()
        });
        
      } catch (deleteError: any) {
        console.error(`❌ Failed to delete subscription ${subscriptionId}:`, deleteError);
        
        return NextResponse.json({
          success: false,
          error: `Failed to delete subscription: ${deleteError.message}`,
          subscriptionId,
          timestamp: new Date().toISOString()
        }, { status: 500 });
      }
    }

    if (action === 'delete_all_bad') {
      console.log('🗑️ Deleting all bad subscriptions...');
      
      try {
        const result = await graphService.deleteAllBadSubscriptions();
        const remainingSubscriptions = await graphService.listAllSubscriptions();
        
        return NextResponse.json({
          success: true,
          message: `Deleted ${result.deletedCount} bad subscriptions`,
          deletedCount: result.deletedCount,
          errors: result.errors,
          remainingSubscriptions,
          timestamp: new Date().toISOString()
        });
        
      } catch (error: any) {
        console.error('❌ Bulk deletion failed:', error);
        return NextResponse.json({
          success: false,
          error: `Bulk deletion failed: ${error.message}`,
          timestamp: new Date().toISOString()
        }, { status: 500 });
      }
    }

    return NextResponse.json({ 
      success: false, 
      error: 'Invalid action' 
    }, { status: 400 });

  } catch (error) {
    console.error('❌ Manual cleanup endpoint error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}