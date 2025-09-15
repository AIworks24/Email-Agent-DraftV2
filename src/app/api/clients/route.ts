import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) 
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    ) 
  : null;

export async function GET() {
  if (!supabase) {
    return NextResponse.json({ 
      error: 'Database not configured' 
    }, { status: 503 });
  }

  try {
    const { data: clients, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ 
      clients: clients || [],
      total: clients?.length || 0 
    });
  } catch (error) {
    console.error('Clients GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch clients' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ 
      error: 'Database not configured' 
    }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { name, email } = body;

    if (!name || !email) {
      return NextResponse.json(
        { error: 'Name and email are required' },
        { status: 400 }
      );
    }

    const { data: client, error } = await supabase
      .from('clients')
      .insert([{ name, email }])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      message: 'Client created successfully',
      client
    }, { status: 201 });
  } catch (error) {
    console.error('Clients POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create client' },
      { status: 500 }
    );
  }
}