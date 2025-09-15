// Create: src/app/api/clients/[id]/settings/route.ts
// This handles saving client AI settings and templates

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clientId = params.id;
    const settings = await request.json();

    console.log('Saving settings for client:', clientId, settings);

    // Validate settings
    if (!settings.writingStyle || !settings.tone) {
      return NextResponse.json(
        { error: 'Writing style and tone are required' },
        { status: 400 }
      );
    }

    // Update client settings in database
    const { data: client, error } = await supabase
      .from('clients')
      .update({ 
        settings: settings,
        updated_at: new Date().toISOString()
      })
      .eq('id', clientId)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to save settings' },
        { status: 500 }
      );
    }

    // Also create/update email template record
    const templateData = {
      client_id: clientId,
      name: 'Default Template',
      writing_style: settings.writingStyle,
      tone: settings.tone,
      signature: settings.signature || '',
      sample_emails: settings.sampleEmails || [],
      is_default: true,
      updated_at: new Date().toISOString()
    };

    const { error: templateError } = await supabase
      .from('email_templates')
      .upsert(templateData, {
        onConflict: 'client_id,is_default',
        ignoreDuplicates: false
      });

    if (templateError) {
      console.error('Template error:', templateError);
      // Don't fail completely, settings were saved
    }

    return NextResponse.json({
      message: 'Settings saved successfully',
      client: client
    });

  } catch (error) {
    console.error('Settings API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clientId = params.id;

    // Get client settings
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    if (clientError) {
      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      );
    }

    // Get email template
    const { data: template, error: templateError } = await supabase
      .from('email_templates')
      .select('*')
      .eq('client_id', clientId)
      .eq('is_default', true)
      .single();

    const settings = {
      writingStyle: client.settings?.writingStyle || template?.writing_style || 'professional',
      tone: client.settings?.tone || template?.tone || 'friendly',
      signature: client.settings?.signature || template?.signature || '',
      sampleEmails: client.settings?.sampleEmails || template?.sample_emails || [''],
      autoResponse: client.settings?.autoResponse !== false,
      responseDelay: client.settings?.responseDelay || 5
    };

    return NextResponse.json({
      settings,
      client
    });

  } catch (error) {
    console.error('Get settings error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}