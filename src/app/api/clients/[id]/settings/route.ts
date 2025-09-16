// Fixed: src/app/api/clients/[id]/settings/route.ts
// Store settings in email_templates table only (which exists)

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

    // Validate settings
    if (!settings.writingStyle || !settings.tone) {
      return NextResponse.json(
        { error: 'Writing style and tone are required' },
        { status: 400 }
      );
    }

    // Store settings in email_templates table (which exists)
    const templateData = {
      client_id: clientId,
      name: 'Default Template',
      writing_style: settings.writingStyle,
      tone: settings.tone,
      signature: settings.signature || '',
      sample_emails: settings.sampleEmails || [],
      is_default: true,
      // Add auto_response and response_delay as JSON in a metadata column
      // Since your table has these columns, let's use them directly
      auto_response: settings.autoResponse,
      response_delay: settings.responseDelay || 0,
      updated_at: new Date().toISOString()
    };

    const { data: template, error } = await supabase
      .from('email_templates')
      .upsert(templateData, {
        onConflict: 'client_id,name', // Use name instead of is_default
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (error) {
      console.error('Template save error:', error);
      return NextResponse.json(
        { error: 'Failed to save settings', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Settings saved successfully',
      template: template
    });

  } catch (error) {
    console.error('Settings save error:', error);
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

    // Get settings from email_templates table
    const { data: template, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('client_id', clientId)
      .eq('name', 'Default Template')
      .single();

    const settings = {
      writingStyle: template?.writing_style || 'professional',
      tone: template?.tone || 'friendly',
      signature: template?.signature || '',
      sampleEmails: template?.sample_emails || [''],
      autoResponse: template?.auto_response !== false,
      responseDelay: template?.response_delay || 0
    };

    return NextResponse.json({ settings });

  } catch (error) {
    console.error('Settings get error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}