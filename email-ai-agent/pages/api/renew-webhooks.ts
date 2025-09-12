// pages/api/renew-webhooks.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { GraphService } from '../../lib/microsoftGraph';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Get all active accounts and renew their webhook subscriptions
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  const { data: accounts } = await supabase
    .from('email_accounts')
    .select('*')
    .eq('is_active', true);
    
  for (const account of accounts) {
    const graphService = new GraphService(account.access_token);
    
    try {
      await graphService.subscribeToEmails(
        `https://your-app-name.vercel.app/api/webhooks/email-received`,
        account.email_address
      );
    } catch (error) {
      console.error(`Failed to renew webhook for ${account.email_address}`);
    }
  }
  
  res.json({ message: 'Webhooks renewed' });
}