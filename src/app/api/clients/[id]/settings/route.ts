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

    const { data, error } = await supabase
      .from('email_templates')
      .upsert({
        client_id: clientId,
        name: 'Default Template',
        writing_style: settings.writingStyle,
        tone: settings.tone,
        signature: settings.signature || '',
        sample_emails: settings.sampleEmails || [],
        is_default: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'client_id,name'
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Settings saved successfully' });

  } catch (error) {
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
      .eq('name', 'Default Template')
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