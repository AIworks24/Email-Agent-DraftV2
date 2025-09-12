import { createClient } from "@supabase/supabase-js";
import { GraphService } from "../../lib/microsoftGraph";
import { NextApiRequest, NextApiResponse } from "next";

// pages/api/setup-webhooks.ts - Run this once per client
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  const { data: accounts } = await supabase
    .from('email_accounts')
    .select('*')
    .eq('is_active', true);
    
  for (const account of accounts) {
    const graphService = new GraphService(account.access_token);
    
    try {
      await graphService.subscribeToEmails(
        `https://your-app.vercel.app/api/webhooks/email-received`,
        account.email_address // Use email as identifier
      );
      
      console.log(`Webhook setup for ${account.email_address}`);
    } catch (error) {
      console.error(`Failed to setup webhook for ${account.email_address}:`, error);
    }
  }
  
  res.json({ message: 'Webhooks setup complete' });
}