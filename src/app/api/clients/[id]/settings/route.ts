// src/app/api/clients/[id]/settings/route.ts - FIXED with detailed logging
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

    console.log('💾 ==========================================');
    console.log('💾 SAVING SETTINGS FOR CLIENT:', clientId);
    console.log('💾 ==========================================');
    console.log('📥 RAW INCOMING SETTINGS:', JSON.stringify(rawSettings, null, 2));

    // Fetch existing template
    const { data: existingTemplate, error: fetchError } = await supabase
      .from('email_templates')
      .select('*')
      .eq('client_id', clientId)
      .eq('name', 'Default Template')
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('❌ Error fetching existing template:', fetchError);
    }

    console.log('📊 EXISTING TEMPLATE:', existingTemplate ? 'Found' : 'Not found');
    if (existingTemplate) {
      console.log('   Current email_filters:', existingTemplate.email_filters);
    }

    // ✅ CRITICAL FIX: Clean up email filters properly
    console.log('🧹 CLEANING EMAIL FILTERS...');
    console.log('   Raw emailFilters from request:', rawSettings.emailFilters);
    
    let emailFilters: string[] = [];
    
    if (Array.isArray(rawSettings.emailFilters)) {
      emailFilters = rawSettings.emailFilters
        .map((email: string) => {
          const cleaned = email.trim().toLowerCase();
          console.log(`   Processing: "${email}" → "${cleaned}"`);
          return cleaned;
        })
        .filter((email: string) => {
          const isValid = email.length > 0 && email.includes('@');
          console.log(`   Valid check: "${email}" = ${isValid}`);
          return isValid;
        });
    }

    console.log('✅ CLEANED EMAIL FILTERS:', emailFilters);
    console.log('   Count:', emailFilters.length);

    // Build update data object
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    // Only update fields that are present in the request
    if (rawSettings.writingStyle !== undefined) {
      updateData.writing_style = rawSettings.writingStyle;
      console.log('   ✓ Writing style:', rawSettings.writingStyle);
    }
    if (rawSettings.tone !== undefined) {
      updateData.tone = rawSettings.tone;
      console.log('   ✓ Tone:', rawSettings.tone);
    }
    if (rawSettings.signature !== undefined) {
      updateData.signature = rawSettings.signature;
      console.log('   ✓ Signature length:', rawSettings.signature.length);
    }
    if (rawSettings.sampleEmails !== undefined) {
      updateData.sample_emails = rawSettings.sampleEmails;
      console.log('   ✓ Sample emails count:', rawSettings.sampleEmails.length);
    }
    if (rawSettings.autoResponse !== undefined) {
      updateData.auto_response = rawSettings.autoResponse;
      console.log('   ✓ Auto response:', rawSettings.autoResponse);
    }
    if (rawSettings.responseDelay !== undefined) {
      updateData.response_delay = rawSettings.responseDelay;
      console.log('   ✓ Response delay:', rawSettings.responseDelay);
    }
    if (rawSettings.customInstructions !== undefined) {
      updateData.custom_instructions = rawSettings.customInstructions;
      console.log('   ✓ Custom instructions length:', rawSettings.customInstructions.length);
    }
    
    // ✅ CRITICAL: Always include email_filters in update
    updateData.email_filters = emailFilters;
    console.log('   ✓ Email filters:', emailFilters);

    console.log('📝 FINAL UPDATE DATA:', JSON.stringify(updateData, null, 2));

    let result;
    if (existingTemplate) {
      console.log('✏️ UPDATING EXISTING TEMPLATE:', existingTemplate.id);
      
      result = await supabase
        .from('email_templates')
        .update(updateData)
        .eq('id', existingTemplate.id)
        .select()
        .single();
    } else {
      console.log('➕ CREATING NEW TEMPLATE');
      
      result = await supabase
        .from('email_templates')
        .insert({
          client_id: clientId,
          name: 'Default Template',
          writing_style: rawSettings.writingStyle || 'professional',
          tone: rawSettings.tone || 'friendly',
          signature: rawSettings.signature || '',
          sample_emails: rawSettings.sampleEmails || [''],
          email_filters: emailFilters,
          custom_instructions: rawSettings.customInstructions || '',
          is_active: true,
          auto_response: rawSettings.autoResponse !== false,
          response_delay: rawSettings.responseDelay || 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
    }

    if (result.error) {
      console.error('❌ DATABASE ERROR:', result.error);
      return NextResponse.json({ 
        error: result.error.message,
        details: result.error 
      }, { status: 500 });
    }

    console.log('✅ SETTINGS SAVED SUCCESSFULLY!');
    console.log('   Template ID:', result.data.id);
    console.log('   Email filters in DB:', result.data.email_filters);
    console.log('💾 ==========================================');

    // Verify the save by reading it back
    const { data: verification } = await supabase
      .from('email_templates')
      .select('email_filters')
      .eq('id', result.data.id)
      .single();

    console.log('🔍 VERIFICATION READ:', verification?.email_filters);

    return NextResponse.json({ 
      message: 'Settings saved successfully',
      data: result.data,
      verification: {
        emailFiltersCount: result.data.email_filters?.length || 0,
        emailFilters: result.data.email_filters
      },
      updated: Object.keys(updateData).filter(k => k !== 'updated_at')
    });

  } catch (error) {
    console.error('❌ SETTINGS SAVE ERROR:', error);
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

    console.log('📖 FETCHING SETTINGS FOR CLIENT:', clientId);

    const { data: template, error: templateError } = await supabase
      .from('email_templates')
      .select('*')
      .eq('client_id', clientId)
      .eq('name', 'Default Template')
      .single();

    if (templateError && templateError.code !== 'PGRST116') {
      console.error('❌ Error fetching template:', templateError);
    }

    console.log('📊 DATABASE TEMPLATE:', {
      found: !!template,
      email_filters: template?.email_filters,
      filter_count: template?.email_filters?.length || 0
    });

    // Map database fields to frontend format
    const settings = {
      writingStyle: template?.writing_style || 'professional',
      tone: template?.tone || 'friendly',
      signature: template?.signature || '',
      sampleEmails: (template?.sample_emails && template.sample_emails.length > 0) 
        ? template.sample_emails 
        : [''],
      autoResponse: template?.auto_response !== false,
      responseDelay: template?.response_delay || 0,
      emailFilters: (template?.email_filters && template.email_filters.length > 0)
        ? template.email_filters
        : [''],
      customInstructions: template?.custom_instructions || ''
    };

    console.log('✅ RETURNING MAPPED SETTINGS:', {
      emailFilters: settings.emailFilters,
      filterCount: settings.emailFilters.length
    });

    return NextResponse.json({ 
      settings,
      debug: {
        templateFound: !!template,
        rawEmailFilters: template?.email_filters,
        mappedEmailFilters: settings.emailFilters,
        hasCustomInstructions: !!template?.custom_instructions
      }
    });
  } catch (error) {
    console.error('❌ SETTINGS GET ERROR:', error);
    return NextResponse.json({ 
      error: 'Failed to load settings',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}