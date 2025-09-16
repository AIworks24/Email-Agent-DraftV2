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

    // Check if template exists for this client
    const { data: existing } = await supabase
      .from('email_templates')
      .select('id')
      .eq('client_id', clientId)
      .eq('name', 'Default Template')
      .single();

    let result;
    if (existing) {
      // Update existing template
      result = await supabase
        .from('email_templates')
        .update({
          writing_style: settings.writingStyle,
          tone: settings.tone,
          signature: settings.signature || '',
          sample_emails: settings.sampleEmails || [],
          auto_response: settings.autoResponse,
          response_delay: settings.responseDelay || 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      // Insert new template - match your exact table structure
      result = await supabase
        .from('email_templates')
        .insert({
          client_id: clientId,
          name: 'Default Template',
          writing_style: settings.writingStyle,
          tone: settings.tone,
          signature: settings.signature || '',
          sample_emails: settings.sampleEmails || [],
          is_active: true, // Your table has is_active, not is_default
          auto_response: settings.autoResponse,
          response_delay: settings.responseDelay || 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
    }

    if (result.error) {
      console.error('Database error:', result.error);
      return NextResponse.json({ 
        error: result.error.message,
        details: result.error 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      message: 'Settings saved successfully',
      data: result.data 
    });

  } catch (error) {
    console.error('Settings save error:', error);
    return NextResponse.json({ 
      error: 'Failed to save settings',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clientId = params.id;

    const { data: template } = await supabase
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
    return NextResponse.json({ 
      error: 'Failed to load settings',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}