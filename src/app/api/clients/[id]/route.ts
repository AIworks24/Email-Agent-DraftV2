// Create: src/app/api/clients/[id]/route.ts
// API routes for individual client management (toggle status, delete)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// PATCH - Toggle client active status
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clientId = params.id;
    const { is_active } = await request.json();

    // Update client status
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .update({ 
        is_active: is_active,
        updated_at: new Date().toISOString()
      })
      .eq('id', clientId)
      .select()
      .single();

    if (clientError) {
      return NextResponse.json({ 
        error: clientError.message 
      }, { status: 500 });
    }

    // If deactivating client, also deactivate email accounts and webhooks
    if (!is_active) {
      // First get email account IDs
      const { data: emailAccounts } = await supabase
        .from('email_accounts')
        .select('id')
        .eq('client_id', clientId);

      // Deactivate email accounts
      await supabase
        .from('email_accounts')
        .update({ 
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('client_id', clientId);

      // Deactivate webhook subscriptions if email accounts exist
      if (emailAccounts && emailAccounts.length > 0) {
        const emailAccountIds = emailAccounts.map(acc => acc.id);
        await supabase
          .from('webhook_subscriptions')
          .update({ 
            is_active: false,
            updated_at: new Date().toISOString()
          })
          .in('email_account_id', emailAccountIds);
      }
    }

    return NextResponse.json({ 
      message: `Client ${is_active ? 'activated' : 'deactivated'} successfully`,
      client: client
    });

  } catch (error) {
    console.error('Client status update error:', error);
    return NextResponse.json({ 
      error: 'Failed to update client status' 
    }, { status: 500 });
  }
}

// DELETE - Remove client and all associated data
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clientId = params.id;

    // Get email account IDs for this client first
    const { data: emailAccounts } = await supabase
      .from('email_accounts')
      .select('id')
      .eq('client_id', clientId);

    if (emailAccounts && emailAccounts.length > 0) {
      const emailAccountIds = emailAccounts.map(acc => acc.id);

      // Delete webhook subscriptions
      const { error: webhookError } = await supabase
        .from('webhook_subscriptions')
        .delete()
        .in('email_account_id', emailAccountIds);

      if (webhookError) {
        console.error('Error deleting webhooks:', webhookError);
      }

      // Delete email logs
      const { error: logsError } = await supabase
        .from('email_logs')
        .delete()
        .in('email_account_id', emailAccountIds);

      if (logsError) {
        console.error('Error deleting logs:', logsError);
      }
    }

    // Delete email accounts
    const { error: accountsError } = await supabase
      .from('email_accounts')
      .delete()
      .eq('client_id', clientId);

    if (accountsError) {
      console.error('Error deleting accounts:', accountsError);
    }

    // Delete email templates
    const { error: templatesError } = await supabase
      .from('email_templates')
      .delete()
      .eq('client_id', clientId);

    if (templatesError) {
      console.error('Error deleting templates:', templatesError);
    }

    // Finally, delete the client
    const { error: clientError } = await supabase
      .from('clients')
      .delete()
      .eq('id', clientId);

    if (clientError) {
      return NextResponse.json({ 
        error: clientError.message 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      message: 'Client and all associated data deleted successfully' 
    });

  } catch (error) {
    console.error('Client deletion error:', error);
    return NextResponse.json({ 
      error: 'Failed to delete client' 
    }, { status: 500 });
  }
}