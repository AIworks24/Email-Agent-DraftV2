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

    // First, check if template exists
    const { data: existing } = await supabase
      .from('email_templates')
      .select('id')
      .eq('client_id', clientId)
      .single();

    let result;
    if (existing) {
      // Update existing
      result = await supabase
        .from('email_templates')
        .update({
          writing_style: settings.writingStyle,
          tone: settings.tone,
          signature: settings.signature || '',
          sample_emails: settings.sampleEmails || [],
          updated_at: new Date().toISOString()
        })
        .eq('client_id', clientId)
        .select()
        .single();
    } else {
      // Insert new
      result = await supabase
        .from('email_templates')
        .insert({
          client_id: clientId,
          name: 'Default Template',
          writing_style: settings.writingStyle,
          tone: settings.tone,
          signature: settings.signature || '',
          sample_emails: settings.sampleEmails || [],
          is_default: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
    }

    if (result.error) {
      console.error('Database error:', result.error);
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Settings saved successfully' });

  } catch (error) {
    console.error('Settings save error:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
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
      .single();

    const settings = {
      writingStyle: template?.writing_style || 'professional',
      tone: template?.tone || 'friendly',
      signature: template?.signature || '',
      sampleEmails: template?.sample_emails || [''],
      autoResponse: true,
      responseDelay: 0
    };

    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}