// src/app/api/clients/[id]/settings/route.ts - Fixed variable scoping
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { settingsSchema, safeValidate } from '@/lib/validation';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

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
    const rawSettings = await request.json();

    console.log('💾 Saving settings for client:', clientId);
    console.log('📥 Incoming settings:', rawSettings);

    // STEP 1: Fetch existing template to preserve unchanged fields
    const { data: existingTemplate } = await supabase
      .from('email_templates')
      .select('*')
      .eq('client_id', clientId)
      .eq('name', 'Default Template')
      .single();

    console.log('📊 Existing template:', existingTemplate);

    // STEP 2: Validate incoming settings
    const validation = safeValidate(settingsSchema, rawSettings);
    let settings: any;
    
    if (!validation.success) {
      console.warn('⚠️ Settings validation failed:', validation.errors);
      settings = rawSettings;
    } else {
      settings = validation.data;
    }

    // STEP 3: Clean up email filters
    const emailFilters = (settings.emailFilters || [])
      .map((email: string) => email.trim().toLowerCase())
      .filter((email: string) => email.length > 0 && email.includes('@'));

    console.log('🧹 Cleaned email filters:', emailFilters);

    // STEP 4: Build update object - ONLY include fields that were sent
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    // Only update fields that are present in the request
    if (settings.writingStyle !== undefined) {
      updateData.writing_style = settings.writingStyle;
    }
    if (settings.tone !== undefined) {
      updateData.tone = settings.tone;
    }
    if (settings.signature !== undefined) {
      updateData.signature = settings.signature;
    }
    if (settings.sampleEmails !== undefined) {
      updateData.sample_emails = settings.sampleEmails;
    }
    if (settings.autoResponse !== undefined) {
      updateData.auto_response = settings.autoResponse;
    }
    if (settings.responseDelay !== undefined) {
      updateData.response_delay = settings.responseDelay;
    }
    if (settings.emailFilters !== undefined) {
      updateData.email_filters = emailFilters;
    }

    console.log('📝 Update data:', updateData);

    let result;
    if (existingTemplate) {
      console.log('✏️ Updating existing template:', existingTemplate.id);
      
      result = await supabase
        .from('email_templates')
        .update(updateData)
        .eq('id', existingTemplate.id)
        .select()
        .single();
    } else {
      console.log('➕ Creating new template');
      
      result = await supabase
        .from('email_templates')
        .insert({
          client_id: clientId,
          name: 'Default Template',
          writing_style: settings.writingStyle || 'professional',
          tone: settings.tone || 'friendly',
          signature: settings.signature || '',
          sample_emails: settings.sampleEmails || [''],
          email_filters: emailFilters,
          is_active: true,
          auto_response: settings.autoResponse !== false,
          response_delay: settings.responseDelay || 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
    }

    if (result.error) {
      console.error('❌ Database error:', result.error);
      return NextResponse.json({ 
        error: result.error.message,
        details: result.error 
      }, { status: 500 });
    }

    console.log('✅ Settings saved successfully');

    return NextResponse.json({ 
      message: 'Settings saved successfully',
      data: result.data,
      updated: Object.keys(updateData).filter(k => k !== 'updated_at')
    });

  } catch (error) {
    console.error('❌ Settings save error:', error);
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

    console.log('📖 Fetching settings for client:', clientId);

    // Fetch the email template from database
    const { data: template, error: templateError } = await supabase
      .from('email_templates')
      .select('*')
      .eq('client_id', clientId)
      .eq('name', 'Default Template')
      .single();

    if (templateError && templateError.code !== 'PGRST116') {
      console.error('❌ Error fetching template:', templateError);
    }

    console.log('📊 Database template:', template);

    // CRITICAL FIX: Properly map ALL database fields with correct defaults
    const settings = {
      writingStyle: template?.writing_style || 'professional',
      tone: template?.tone || 'friendly',
      signature: template?.signature || '',
      sampleEmails: (template?.sample_emails && template.sample_emails.length > 0) 
        ? template.sample_emails 
        : [''],
      autoResponse: template?.auto_response !== false,
      responseDelay: template?.response_delay || 0,
      // CRITICAL: Map email_filters from database to emailFilters for frontend
      emailFilters: (template?.email_filters && template.email_filters.length > 0)
        ? template.email_filters
        : ['']
    };

    console.log('✅ Returning mapped settings:', settings);

    return NextResponse.json({ 
      settings,
      debug: {
        templateFound: !!template,
        rawEmailFilters: template?.email_filters,
        mappedEmailFilters: settings.emailFilters
      }
    });
  } catch (error) {
    console.error('❌ Settings GET error:', error);
    return NextResponse.json({ 
      error: 'Failed to load settings',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}