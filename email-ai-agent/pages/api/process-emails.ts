import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { GraphService } from '../../lib/microsoftGraph';
import { AIEmailProcessor } from '../../lib/aiProcessor';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface EmailAccount {
  id: string;
  email_address: string;
  access_token: string;
  refresh_token: string;
  clients: {
    id: string;
    name: string;
  };
  email_templates: Array<{
    id: string;
    writing_style: string;
    tone: string;
    signature: string;
    sample_emails: string[];
  }>;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get all active email accounts
    const { data: emailAccounts, error } = await supabase
      .from('email_accounts')
      .select(`
        *,
        clients(*),
        email_templates(*)
      `)
      .eq('is_active', true);

    if (error) {
      throw error;
    }

    if (!emailAccounts || emailAccounts.length === 0) {
      return res.status(200).json({ message: 'No active email accounts found' });
    }

    const results = [];
    for (const account of emailAccounts) {
      try {
        const result = await processAccountEmails(account as EmailAccount);
        results.push({ accountId: account.id, result });
      } catch (error) {
        console.error(`Error processing account ${account.id}:`, error);
        results.push({ accountId: account.id, error: error.message });
      }
    }

    res.status(200).json({ 
      message: 'Email processing completed', 
      results 
    });
  } catch (error) {
    console.error('Process emails error:', error);
    res.status(500).json({ error: error.message });
  }
}

async function processAccountEmails(account: EmailAccount) {
  const graphService = new GraphService(account.access_token);
  const aiProcessor = new AIEmailProcessor(process.env.ANTHROPIC_API_KEY!);
  
  // Get recent emails
  const emails = await graphService.getEmails(10);
  
  const processedEmails = [];
  
  for (const email of emails.value) {
    try {
      // Check if already processed
      const { data: existing } = await supabase
        .from('email_logs')
        .select('id')
        .eq('message_id', email.id)
        .single();
      
      if (existing) {
        continue;
      }
      
      // Get calendar availability for next 2 weeks
      const now = new Date();
      const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      const availability = await graphService.getCalendarEvents(
        now.toISOString(),
        twoWeeksLater.toISOString()
      );
      
      // Use first template or add logic to select appropriate one
      const template = account.email_templates[0];
      
      if (!template) {
        console.log(`No template found for account ${account.id}`);
        continue;
      }
      
      // Process with AI
      const aiResponse = await aiProcessor.generateResponse({
        subject: email.subject || '',
        fromEmail: email.from?.emailAddress?.address || '',
        body: email.body?.content || '',
        clientTemplate: {
          writingStyle: template.writing_style || '',
          tone: template.tone || 'professional',
          signature: template.signature || '',
          sampleEmails: template.sample_emails || []
        },
        calendarAvailability: availability.value || []
      });
      
      // Create draft in Outlook
      await graphService.createDraftReply(email.id, aiResponse, true);
      
      // Log the processing
      const { error: logError } = await supabase
        .from('email_logs')
        .insert({
          email_account_id: account.id,
          message_id: email.id,
          subject: email.subject || '',
          sender_email: email.from?.emailAddress?.address || '',
          ai_response: aiResponse,
          status: 'draft_created',
          tokens_used: Math.ceil(aiResponse.length / 4)
        });
      
      if (logError) {
        console.error('Error logging email processing:', logError);
      }
      
      processedEmails.push(email.id);
    } catch (error) {
      console.error(`Error processing email ${email.id}:`, error);
      
      // Log the error
      await supabase
        .from('email_logs')
        .insert({
          email_account_id: account.id,
          message_id: email.id,
          subject: email.subject || '',
          sender_email: email.from?.emailAddress?.address || '',
          ai_response: '',
          status: 'error',
          tokens_used: 0
        });
    }
  }
  
  return { processedEmails: processedEmails.length };
}