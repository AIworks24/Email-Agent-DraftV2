// Create: src/lib/env-status.ts
// This will fix the envStatus errors in your page.tsx

export const envStatus = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Configured' : 'Not Set',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Configured' : 'Not Set', 
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? 'Configured' : 'Not Set',
  MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID ? 'Configured' : 'Not Set',
  MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET ? 'Configured' : 'Not Set',
  WEBHOOK_BASE_URL: process.env.WEBHOOK_BASE_URL ? 'Configured' : 'Not Set'
};

// For your page.tsx line 146-159 usage
export default envStatus;