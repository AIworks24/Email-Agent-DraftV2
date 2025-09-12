import { NextRequest, NextResponse } from 'next/server';


// Note: GraphService and AIEmailProcessor imports will need to be added later
// import { GraphService } from '../../../../lib/microsoftGraph';
// import { AIEmailProcessor } from '../../../../lib/aiProcessor';
// import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const notifications = body.value;
    
    for (const notification of notifications) {
      // Process each email immediately
      await processEmailNotification(notification);
    }
    
    return NextResponse.json({ status: 'processed' });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  // Webhook validation
  const { searchParams } = new URL(request.url);
  const validationToken = searchParams.get('validationToken');
  
  if (validationToken) {
    return new NextResponse(validationToken, { status: 200 });
  }
  
  return NextResponse.json({ error: 'Missing validation token' }, { status: 400 });
}

async function processEmailNotification(notification: any) {
  console.log('Processing email notification:', notification);
  
  // TODO: Implement this once lib files are properly structured
  // For now, just log the notification
  
  /*
  const { resource, clientState } = notification;
  
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  const { data: account } = await supabase
    .from('email_accounts')
    .select('*, clients(*), email_templates(*)')
    .eq('email_address', clientState)
    .single();
    
  if (!account) return;
  
  // ... rest of implementation
  */
}