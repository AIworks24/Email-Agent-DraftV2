// src/app/api/clients/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = (supabaseUrl && supabaseServiceKey) ? createClient(
  supabaseUrl,
  supabaseServiceKey
) : null;

// GET /api/clients - List all clients
export async function GET() {
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    const { data: clients, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 });
    }

    // Return clients with basic stats structure
    const clientsWithStats = (clients || []).map((client: any) => ({
      ...client,
      stats: {
        totalEmails: 0,
        draftsCreated: 0,
        errors: 0
      },
      status: client.is_active ? 'active' : 'inactive'
    }));

    return NextResponse.json({ clients: clientsWithStats });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/clients - Create new client
export async function POST(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { name, email, company } = body;

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    const { data: client, error } = await supabase
      .from('clients')
      .insert({
        name,
        email,
        company: company || null
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to create client' }, { status: 500 });
    }

    return NextResponse.json({ client }, { status: 201 });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}