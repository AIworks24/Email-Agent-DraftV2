// pages/api/webhooks/email-received.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { GraphService } from '../../../lib/microsoftGraph';
import { AIEmailProcessor } from '../../../lib/aiProcessor';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    // Webhook notification from Microsoft Graph
    const notifications = req.body.value;
    
    for (const notification of notifications) {
      // Process each email immediately
      await processEmailNotification(notification);
    }
    
    return res.status(200).json({ status: 'processed' });
  }
  
  if (req.method === 'GET') {
    // Webhook validation
    return res.status(200).send(req.query.validationToken);
  }
}

async function processEmailNotification(notification: any) {
  const { resource, clientState } = notification;
  
  // Get email account from clientState or resource
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  const { data: account } = await supabase
    .from('email_accounts')
    .select('*, clients(*), email_templates(*)')
    .eq('email_address', clientState) // Store email as clientState
    .single();
    
  if (!account) return;
  
  const graphService = new GraphService(account.access_token);
  const aiProcessor = new AIEmailProcessor(process.env.ANTHROPIC_API_KEY!);
  
  // Get the specific email
  const messageId = resource.split('/messages/')[1];
  const email = await graphService.getEmails(messageId);
  
  // Process immediately with AI
  const template = account.email_templates[0];
  const aiResponse = await aiProcessor.generateResponse({
    subject: email.subject,
    fromEmail: email.from.emailAddress.address,
    body: email.body.content,
    clientTemplate: {
      writingStyle: template.writing_style,
      tone: template.tone,
      signature: template.signature,
      sampleEmails: template.sample_emails
    }
  });
  
  // Create draft immediately
  await graphService.createDraftReply(email.id, aiResponse, true);
  
  // Log the processing
  await supabase.from('email_logs').insert({
    email_account_id: account.id,
    message_id: email.id,
    subject: email.subject,
    sender_email: email.from.emailAddress.address,
    ai_response: aiResponse,
    status: 'draft_created'
  });
}