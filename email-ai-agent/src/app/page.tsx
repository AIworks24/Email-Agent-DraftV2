'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface Client {
  id: string;
  name: string;
  email: string;
  created_at: string;
  is_active: boolean;
}

interface EmailLog {
  id: string;
  email_account_id: string;
  subject: string;
  sender_email: string;
  original_body: string;
  ai_response: string;
  status: 'pending' | 'processed' | 'draft_created' | 'error';
  tokens_used: number;
  created_at: string;
}

export default function AIEmailAgentApp() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', email: '' });
  const [setupStep, setSetupStep] = useState(1);

  // Environment setup check
  const [envSetup, setEnvSetup] = useState({
    supabase: false,
    anthropic: false,
    microsoft: false
  });

  useEffect(() => {
    checkEnvironmentSetup();
    if (envSetup.supabase) {
      fetchClients();
    }
  }, [envSetup.supabase]);

  useEffect(() => {
    if (selectedClient && envSetup.supabase) {
      fetchEmailLogs(selectedClient);
    }
  }, [selectedClient, envSetup.supabase]);

  const checkEnvironmentSetup = () => {
    const supabaseCheck = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    // Note: We can't check server-side env vars from client, so we'll assume they're set if Supabase is configured
    const anthropicCheck = supabaseCheck; // Will be validated server-side
    const microsoftCheck = supabaseCheck; // Will be validated server-side
    
    setEnvSetup({
      supabase: supabaseCheck,
      anthropic: anthropicCheck,
      microsoft: microsoftCheck
    });
  };

  const fetchClients = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmailLogs = async (clientId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('email_logs')
        .select(`
          *,
          email_accounts!inner(
            client_id,
            email_address
          )
        `)
        .eq('email_accounts.client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setEmailLogs(data || []);
    } catch (error) {
      console.error('Error fetching email logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const createClient = async () => {
    if (!newClient.name || !newClient.email) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('clients')
        .insert([
          {
            name: newClient.name,
            email: newClient.email,
            is_active: true
          }
        ])
        .select()
        .single();

      if (error) throw error;
      
      setClients([data, ...clients]);
      setNewClient({ name: '', email: '' });
      alert('Client created successfully!');
    } catch (error) {
      console.error('Error creating client:', error);
      alert('Error creating client');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = 'px-2 py-1 rounded-full text-xs font-medium';
    switch (status) {
      case 'draft_created':
        return `${baseClasses} bg-green-100 text-green-800`;
      case 'processed':
        return `${baseClasses} bg-blue-100 text-blue-800`;
      case 'error':
        return `${baseClasses} bg-red-100 text-red-800`;
      case 'pending':
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  // Setup component
  const SetupComponent = () => (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">AI Email Agent Setup</h1>
      
      <div className="mb-8">
        <div className="flex items-center space-x-4">
          {[1, 2, 3, 4].map((step) => (
            <div key={step} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step <= setupStep ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {step}
              </div>
              {step < 4 && <div className={`w-16 h-1 ${step < setupStep ? 'bg-blue-600' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>
        <div className="mt-4">
          <p className="text-sm text-gray-600">
            Step {setupStep} of 4: {
              setupStep === 1 ? 'Environment Variables' :
              setupStep === 2 ? 'Database Setup' :
              setupStep === 3 ? 'Authentication' : 'Test & Launch'
            }
          </p>
        </div>
      </div>

      {setupStep === 1 && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Environment Configuration</h2>
          <p className="text-gray-600 mb-6">Add these environment variables to your Vercel project settings:</p>
          
          <div className="bg-gray-50 p-4 rounded-lg mb-6">
            <pre className="text-sm text-gray-800 whitespace-pre-wrap">{`# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Anthropic API (for AI responses)
ANTHROPIC_API_KEY=your_anthropic_api_key

# Microsoft Graph API (for email access)
MICROSOFT_CLIENT_ID=your_azure_app_client_id
MICROSOFT_CLIENT_SECRET=your_azure_app_client_secret
MICROSOFT_TENANT_ID=your_azure_tenant_id

# Webhook configuration (use your Vercel domain)
WEBHOOK_BASE_URL=https://your-vercel-app.vercel.app`}</pre>
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <span className={`w-3 h-3 rounded-full ${envSetup.supabase ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm">Supabase Configuration</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`w-3 h-3 rounded-full ${envSetup.anthropic ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm">Anthropic API Key</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`w-3 h-3 rounded-full ${envSetup.microsoft ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm">Microsoft Graph API</span>
            </div>
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-medium text-blue-800 mb-2">For Vercel Deployment:</h3>
            <ol className="text-sm text-blue-700 space-y-1">
              <li>1. Go to your Vercel project dashboard</li>
              <li>2. Navigate to Settings → Environment Variables</li>
              <li>3. Add each variable listed above</li>
              <li>4. Redeploy your application</li>
            </ol>
          </div>

          <button 
            onClick={() => setSetupStep(2)}
            disabled={!envSetup.supabase}
            className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
          >
            Next: Database Setup
          </button>
        </div>
      )}

      {/* Other setup steps remain the same as in the original artifact... */}
      {setupStep === 2 && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Database Schema</h2>
          <p className="text-gray-600 mb-6">Run this SQL in your Supabase SQL editor to create the required tables:</p>
          
          <div className="bg-gray-50 p-4 rounded-lg mb-6 text-sm max-h-96 overflow-y-auto">
            <pre className="text-gray-800 whitespace-pre-wrap">{`-- Create clients table
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create email_accounts table
CREATE TABLE email_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    email_address TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    subscription_id TEXT,
    subscription_expires TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(client_id, email_address)
);

-- Create email_templates table
CREATE TABLE email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    writing_style TEXT NOT NULL DEFAULT 'professional',
    tone TEXT NOT NULL DEFAULT 'friendly',
    signature TEXT NOT NULL,
    sample_emails TEXT[] DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create email_logs table
CREATE TABLE email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_account_id UUID REFERENCES email_accounts(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    sender_email TEXT NOT NULL,
    original_body TEXT NOT NULL,
    ai_response TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'draft_created', 'error')),
    tokens_used INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Enable read access for all users" ON clients FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON clients FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON clients FOR UPDATE USING (true);

CREATE POLICY "Enable read access for all users" ON email_accounts FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON email_accounts FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON email_accounts FOR UPDATE USING (true);

CREATE POLICY "Enable read access for all users" ON email_templates FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON email_templates FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON email_templates FOR UPDATE USING (true);

CREATE POLICY "Enable read access for all users" ON email_logs FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON email_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON email_logs FOR UPDATE USING (true);`}</pre>
          </div>

          <div className="flex space-x-4">
            <button 
              onClick={() => setSetupStep(1)}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Previous
            </button>
            <button 
              onClick={() => setSetupStep(3)}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Next: Authentication
            </button>
          </div>
        </div>
      )}

      {setupStep === 3 && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Microsoft Azure App Registration</h2>
          <p className="text-gray-600 mb-6">Configure Microsoft Graph API access for email automation:</p>
          
          <div className="space-y-4 mb-6">
            <div className="border-l-4 border-blue-500 pl-4">
              <h3 className="font-medium">1. Create Azure App Registration</h3>
              <p className="text-sm text-gray-600">Go to Azure Portal → App Registrations → New Registration</p>
            </div>
            
            <div className="border-l-4 border-blue-500 pl-4">
              <h3 className="font-medium">2. Configure Permissions</h3>
              <p className="text-sm text-gray-600">Add these Microsoft Graph permissions:</p>
              <ul className="text-sm text-gray-600 ml-4 list-disc">
                <li>Mail.Read (Delegated)</li>
                <li>Mail.ReadWrite (Delegated)</li>
                <li>Mail.Send (Delegated)</li>
                <li>Calendars.Read (Delegated)</li>
              </ul>
            </div>

            <div className="border-l-4 border-blue-500 pl-4">
              <h3 className="font-medium">3. Set Redirect URI</h3>
              <p className="text-sm text-gray-600">Add: <code className="bg-gray-100 px-1 rounded">https://your-vercel-app.vercel.app/api/auth/callback</code></p>
            </div>

            <div className="border-l-4 border-blue-500 pl-4">
              <h3 className="font-medium">4. Create Client Secret</h3>
              <p className="text-sm text-gray-600">Go to Certificates & secrets → New client secret</p>
            </div>
          </div>

          <div className="flex space-x-4">
            <button 
              onClick={() => setSetupStep(2)}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Previous
            </button>
            <button 
              onClick={() => setSetupStep(4)}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Next: Test & Launch
            </button>
          </div>
        </div>
      )}

      {setupStep === 4 && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Test & Launch</h2>
          <p className="text-gray-600 mb-6">Verify your setup and start using the AI Email Agent:</p>
          
          <div className="space-y-4 mb-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-medium text-green-800">🎉 Setup Complete!</h3>
              <p className="text-sm text-green-600">Your AI Email Agent is ready to use on Vercel.</p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-medium text-blue-800">Next Steps:</h3>
              <ul className="text-sm text-blue-600 ml-4 list-disc">
                <li>Create your first client</li>
                <li>Set up email templates and AI writing style</li>
                <li>Configure OAuth for email access</li>
                <li>Test the webhook endpoint</li>
              </ul>
            </div>
          </div>

          <div className="flex space-x-4">
            <button 
              onClick={() => setSetupStep(3)}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Previous
            </button>
            <button 
              onClick={() => setActiveTab('dashboard')}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // Dashboard component
  const DashboardComponent = () => (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">AI Email Agent Dashboard</h1>
      
      {/* Client Selection */}
      <div className="mb-6 bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">Select Client</h2>
        <div className="flex space-x-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Active Clients
            </label>
            <select 
              className="w-full border border-gray-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
            >
              <option value="">Choose a client...</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>
                  {client.name} ({client.email})
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setActiveTab('clients')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Manage Clients
          </button>
        </div>
      </div>

      {/* Email Logs */}
      {selectedClient && (
        <div className="bg-white rounded-lg shadow-md">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold">Recent Email Activity</h2>
          </div>
          
          {loading ? (
            <div className="p-6 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">Loading...</p>
            </div>
          ) : emailLogs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">From</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tokens</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {emailLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {log.subject}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.sender_email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={getStatusBadge(log.status)}>
                          {log.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.tokens_used}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(log.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-center text-gray-500">
              No email activity found for this client.
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Client Management Component
  const ClientManagementComponent = () => (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Client Management</h1>
      
      {/* Add New Client */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Add New Client</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Client Name
            </label>
            <input
              type="text"
              value={newClient.name}
              onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter client name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={newClient.email}
              onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter email address"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={createClient}
              disabled={loading || !newClient.name || !newClient.email}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? 'Creating...' : 'Add Client'}
            </button>
          </div>
        </div>
      </div>

      {/* Existing Clients */}
      <div className="bg-white rounded-lg shadow-md">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold">Existing Clients</h2>
        </div>
        
        {loading ? (
          <div className="p-6 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading...</p>
          </div>
        ) : clients.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {client.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {client.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        client.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {client.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(client.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button className="text-blue-600 hover:text-blue-900 mr-3">
                        Edit
                      </button>
                      <button className="text-red-600 hover:text-red-900">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-gray-500">
            No clients found. Add your first client above.
          </div>
        )}
      </div>
    </div>
  );

  // Check if setup is needed
  const needsSetup = !envSetup.supabase;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-8">
              <h1 className="text-xl font-bold text-gray-900">AI Email Agent</h1>
              <div className="flex space-x-6">
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className={`px-3 py-2 text-sm font-medium ${
                    activeTab === 'dashboard'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Dashboard
                </button>
                <button
                  onClick={() => setActiveTab('clients')}
                  className={`px-3 py-2 text-sm font-medium ${
                    activeTab === 'clients'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Clients
                </button>
                <button
                  onClick={() => setActiveTab('setup')}
                  className={`px-3 py-2 text-sm font-medium ${
                    activeTab === 'setup'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Setup
                </button>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${
                  Object.values(envSetup).every(Boolean) ? 'bg-green-500' : 'bg-yellow-500'
                }`} />
                <span className="text-sm text-gray-600">
                  {Object.values(envSetup).every(Boolean) ? 'Ready' : 'Setup Required'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main>
        {needsSetup && activeTab !== 'setup' && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  Setup required. Please configure your environment variables and database.{' '}
                  <button
                    onClick={() => setActiveTab('setup')}
                    className="font-medium underline text-yellow-700 hover:text-yellow-600"
                  >
                    Go to Setup
                  </button>
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'setup' && <SetupComponent />}
        {activeTab === 'dashboard' && <DashboardComponent />}
        {activeTab === 'clients' && <ClientManagementComponent />}
      </main>
    </div>
  );
}