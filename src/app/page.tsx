'use client';

import { useState, useEffect } from 'react';
import { envStatus } from '@/lib/env-status';

interface ClientSettings {
  writingStyle: 'professional' | 'casual' | 'formal' | 'friendly' | 'concise' | string;
  tone: 'friendly' | 'professional' | 'enthusiastic' | 'neutral' | 'empathetic' | string;
  signature: string;
  sampleEmails: string[];
  autoResponse: boolean;
  responseDelay: number; // minutes
}

interface Client {
  id: string;
  name: string;
  email: string;
  status: string;
  stats: {
    totalEmails: number;
  };
  // Added so client.settings?. works with TypeScript
  settings?: Partial<ClientSettings>;
}

interface EmailStats {
  totalEmails: number;
  draftsCreated: number;
  emailsSent: number;
  activeClients: number;
}

export default function ClientDashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [clients, setClients] = useState<Client[]>([]);
  const [emailStats, setEmailStats] = useState<EmailStats>({
    totalEmails: 0,
    draftsCreated: 0,
    emailsSent: 0,
    activeClients: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [clientsResponse, statsResponse] = await Promise.all([
        fetch('/api/clients'),
        fetch('/api/stats')
      ]);

      if (clientsResponse.ok) {
        const clientsData = await clientsResponse.json();
        setClients(clientsData.clients || []);
      }

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setEmailStats(statsData.stats || {
          totalEmails: 0,
          draftsCreated: 0,
          emailsSent: 0,
          activeClients: 0
        });
      }
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const initiateClientRegistration = async () => {
    try {
      console.log('Starting Microsoft Graph OAuth flow...');
      
      // Generate a temporary client ID for the OAuth flow
      const tempClientId = `temp-${Date.now()}`;
      const returnUrl = encodeURIComponent(window.location.pathname);
      
      // Redirect to Microsoft Graph OAuth
      const authUrl = `/api/auth/signin?clientId=${tempClientId}&returnUrl=${returnUrl}`;
      console.log('Redirecting to:', authUrl);
      
      // This will redirect the user to Microsoft login
      window.location.href = authUrl;
      
    } catch (error) {
      console.error('Registration error:', error);
      alert('Failed to start client registration. Please check the console for details.');
    }
  };

  // ===== New state per your instructions =====
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showManageModal, setShowManageModal] = useState(false);
  const [clientSettings, setClientSettings] = useState<ClientSettings>({
    writingStyle: 'professional',
    tone: 'friendly',
    signature: '',
    sampleEmails: [''],
    autoResponse: true,
    responseDelay: 5 // minutes
  });

  // ===== Handlers per your instructions =====
  const handleManageClient = (client: Client) => {
    console.log('Managing client:', client);
    setSelectedClient(client);
    
    // Load existing settings or set defaults
    setClientSettings({
      writingStyle: client.settings?.writingStyle || 'professional',
      tone: client.settings?.tone || 'friendly', 
      signature: client.settings?.signature || `Best regards,\n${client.name}`,
      sampleEmails: client.settings?.sampleEmails || [''],
      autoResponse: client.settings?.autoResponse !== false,
      responseDelay: client.settings?.responseDelay ?? 5
    });
    
    setShowManageModal(true);
  };

  const saveClientSettings = async () => {
    if (!selectedClient) return;
    
    try {
      const response = await fetch(`/api/clients/${selectedClient.id}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(clientSettings),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      // Update local client data
      setClients(clients.map(client => 
        client.id === selectedClient.id 
          ? { ...client, settings: clientSettings }
          : client
      ));
      
      setShowManageModal(false);
      alert('Settings saved successfully!');
      
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings. Please try again.');
    }
  };

  const updateSampleEmail = (index: number, value: string) => {
    const newSampleEmails = [...clientSettings.sampleEmails];
    newSampleEmails[index] = value;
    setClientSettings({ ...clientSettings, sampleEmails: newSampleEmails });
  };

  const addSampleEmail = () => {
    setClientSettings({ 
      ...clientSettings, 
      sampleEmails: [...clientSettings.sampleEmails, ''] 
    });
  };

  const removeSampleEmail = (index: number) => {
    if (clientSettings.sampleEmails.length > 1) {
      const newSampleEmails = clientSettings.sampleEmails.filter((_, i) => i !== index);
      setClientSettings({ ...clientSettings, sampleEmails: newSampleEmails });
    }
  };

  // ===== Original inline styles kept =====
  const buttonStyle = {
    padding: '12px 24px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500' as const,
    transition: 'all 0.2s ease',
    marginRight: '8px',
    marginBottom: '8px'
  };

  const cardStyle = {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    border: '1px solid #e5e7eb',
    marginBottom: '24px'
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f9fafb',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '24px'
      }}>
        {/* Header */}
        <div style={cardStyle}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '24px'
          }}>
            <div>
              <h1 style={{
                fontSize: '28px',
                fontWeight: 'bold',
                margin: '0 0 8px 0',
                color: '#111827'
              }}>
                AI Email Agent Dashboard
              </h1>
              <p style={{
                color: '#6b7280',
                margin: 0,
                fontSize: '16px'
              }}>
                Manage client email automation and AI responses
              </p>
            </div>
            <div style={{
              display: 'flex',
              gap: '12px'
            }}>
              <div style={{
                padding: '8px 16px',
                backgroundColor: '#10b981',
                color: 'white',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500'
              }}>
                ✓ System Online
              </div>
              <button 
                onClick={initiateClientRegistration}
                style={{
                  ...buttonStyle,
                  backgroundColor: '#3b82f6',
                  color: 'white'
                }}>
                + Add Client
              </button>
            </div>
          </div>

          {/* Navigation */}
          <div>
            {['dashboard', 'clients', 'settings'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  ...buttonStyle,
                  backgroundColor: activeTab === tab ? '#3b82f6' : '#f3f4f6',
                  color: activeTab === tab ? 'white' : '#374151'
                }}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Dashboard Content */}
        {activeTab === 'dashboard' && (
          <div>
            {/* Stats Overview */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '24px',
              marginBottom: '24px'
            }}>
              <div style={{
                ...cardStyle,
                textAlign: 'center' as const,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white'
              }}>
                <div style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '8px' }}>
                  {loading ? '...' : emailStats.totalEmails}
                </div>
                <div style={{ fontSize: '14px', opacity: 0.9 }}>
                  Total Emails Processed
                </div>
              </div>
              
              <div style={{
                ...cardStyle,
                textAlign: 'center' as const,
                background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                color: 'white'
              }}>
                <div style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '8px' }}>
                  {loading ? '...' : emailStats.draftsCreated}
                </div>
                <div style={{ fontSize: '14px', opacity: 0.9 }}>
                  AI Drafts Created
                </div>
              </div>

              <div style={{
                ...cardStyle,
                textAlign: 'center' as const,
                background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                color: 'white'
              }}>
                <div style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '8px' }}>
                  {loading ? '...' : emailStats.emailsSent}
                </div>
                <div style={{ fontSize: '14px', opacity: 0.9 }}>
                  Emails Sent
                </div>
              </div>

              <div style={{
                ...cardStyle,
                textAlign: 'center' as const,
                background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
                color: 'white'
              }}>
                <div style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '8px' }}>
                  {loading ? '...' : emailStats.activeClients}
                </div>
                <div style={{ fontSize: '14px', opacity: 0.9 }}>
                  Active Clients
                </div>
              </div>
            </div>

            {/* Activity Section */}
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>
                Email Activity
              </h3>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                  Loading...
                </div>
              ) : clients.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '40px',
                  color: '#6b7280'
                }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>📧</div>
                  <div style={{ fontSize: '18px', marginBottom: '8px' }}>No Email Activity Yet</div>
                  <div style={{ fontSize: '14px', marginBottom: '16px' }}>
                    Connect your first client to start processing emails.
                  </div>
                  <button
                    onClick={initiateClientRegistration}
                    style={{
                      ...buttonStyle,
                      backgroundColor: '#3b82f6',
                      color: 'white'
                    }}
                  >
                    Add Your First Client
                  </button>
                </div>
              ) : (
                <div style={{ color: '#6b7280', textAlign: 'center', padding: '20px' }}>
                  Email activity will appear here once emails are processed.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Clients Tab */}
        {activeTab === 'clients' && (
          <div style={cardStyle}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '24px'
            }}>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>
                Client Management
              </h2>
              <button 
                onClick={initiateClientRegistration}
                style={{
                  ...buttonStyle,
                  backgroundColor: '#3b82f6',
                  color: 'white'
                }}>
                + Add New Client
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                Loading clients...
              </div>
            ) : error ? (
              <div style={{
                textAlign: 'center',
                padding: '40px',
                color: '#dc2626',
                backgroundColor: '#fef2f2',
                borderRadius: '8px',
                border: '1px solid #fecaca'
              }}>
                <div style={{ fontSize: '16px', marginBottom: '8px' }}>⚠️ Error Loading Clients</div>
                <div style={{ fontSize: '14px', marginBottom: '16px' }}>{error}</div>
                <button
                  onClick={loadDashboardData}
                  style={{
                    ...buttonStyle,
                    backgroundColor: '#dc2626',
                    color: 'white'
                  }}
                >
                  Retry
                </button>
              </div>
            ) : clients.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '60px',
                backgroundColor: '#f9fafb',
                borderRadius: '8px',
                border: '2px dashed #d1d5db'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>👥</div>
                <div style={{ fontSize: '18px', marginBottom: '8px', color: '#374151' }}>
                  No Clients Yet
                </div>
                <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
                  Add your first client to start automating email responses.
                </div>
                <button style={{
                  ...buttonStyle,
                  backgroundColor: '#3b82f6',
                  color: 'white'
                }}>
                  Add Your First Client
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '16px' }}>
                {clients.map((client) => (
                  <div key={client.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    backgroundColor: 'white'
                  }}>
                    <div>
                      <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                        {client.name}
                      </div>
                      <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>
                        {client.email}
                      </div>
                      <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                        {client.stats?.totalEmails || 0} emails processed
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '500',
                        backgroundColor: client.status === 'active' ? '#dcfce7' : '#fef3c7',
                        color: client.status === 'active' ? '#16a34a' : '#d97706'
                      }}>
                        {client.status}
                      </span>

                      {/* Updated Manage button to use the handler (Tailwind classes per your snippet) */}
                      <button
                        onClick={() => handleManageClient(client)}
                        className="text-blue-600 hover:text-blue-900 font-medium"
                        style={{ padding: '8px 12px', background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 6 }}
                      >
                        Manage
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div style={cardStyle}>
            <h2 style={{ margin: '0 0 16px 0' }}>System Configuration</h2>
            <p style={{ margin: '0 0 24px 0', color: '#6b7280' }}>
              Environment variables status:
            </p>
            
            <div style={{
              backgroundColor: '#f3f4f6',
              padding: '16px',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '12px',
              marginBottom: '24px'
            }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
{`# Environment Status
${envStatus?.NEXT_PUBLIC_SUPABASE_URL ? '✓' : '❌'} NEXT_PUBLIC_SUPABASE_URL: ${envStatus?.NEXT_PUBLIC_SUPABASE_URL ? 'Configured' : 'Not Set'}
${envStatus?.SUPABASE_SERVICE_ROLE_KEY ? '✓' : '❌'} SUPABASE_SERVICE_ROLE_KEY: ${envStatus?.SUPABASE_SERVICE_ROLE_KEY ? 'Configured' : 'Not Set'}
${envStatus?.ANTHROPIC_API_KEY ? '✓' : '❌'} ANTHROPIC_API_KEY: ${envStatus?.ANTHROPIC_API_KEY ? 'Configured' : 'Not Set'}
${envStatus?.MICROSOFT_CLIENT_ID ? '✓' : '❌'} MICROSOFT_CLIENT_ID: ${envStatus?.MICROSOFT_CLIENT_ID ? 'Configured' : 'Not Set'}
${envStatus?.MICROSOFT_CLIENT_SECRET ? '✓' : '❌'} MICROSOFT_CLIENT_SECRET: ${envStatus?.MICROSOFT_CLIENT_SECRET ? 'Configured' : 'Not Set'}
${envStatus?.WEBHOOK_BASE_URL ? '✓' : '❌'} WEBHOOK_BASE_URL: ${envStatus?.WEBHOOK_BASE_URL ? 'Configured' : 'Not Set'}`}
              </pre>
            </div>

            <div style={{
              padding: '16px',
              backgroundColor: '#f0f9ff',
              borderRadius: '6px',
              borderLeft: '4px solid #3b82f6'
            }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#1e40af' }}>Next Steps</h4>
              <ol style={{ margin: 0, paddingLeft: '20px', color: '#1e40af' }}>
                <li>Configure missing environment variables in Vercel</li>
                <li>Set up Supabase database tables</li>
                <li>Add your first client</li>
                <li>Test email automation workflow</li>
              </ol>
            </div>
          </div>
        )}
      </div>

      {showManageModal && selectedClient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold text-gray-900">
                  Manage Client: {selectedClient.name}
                </h2>
                <button
                  onClick={() => setShowManageModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Close modal"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Client Info */}
              <div className="bg-gray-50 p-4 rounded-lg mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <p className="text-gray-900">{selectedClient.email}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Status</label>
                    <span className={`px-2 py-1 rounded text-xs ${
                      selectedClient.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {selectedClient.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* AI Response Settings */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">AI Response Settings</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Writing Style */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Writing Style
                      </label>
                      <select
                        value={clientSettings.writingStyle}
                        onChange={(e) => setClientSettings({...clientSettings, writingStyle: e.target.value})}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="professional">Professional</option>
                        <option value="casual">Casual</option>
                        <option value="formal">Formal</option>
                        <option value="friendly">Friendly</option>
                        <option value="concise">Concise</option>
                      </select>
                    </div>

                    {/* Tone */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Tone
                      </label>
                      <select
                        value={clientSettings.tone}
                        onChange={(e) => setClientSettings({...clientSettings, tone: e.target.value})}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="friendly">Friendly</option>
                        <option value="professional">Professional</option>
                        <option value="enthusiastic">Enthusiastic</option>
                        <option value="neutral">Neutral</option>
                        <option value="empathetic">Empathetic</option>
                      </select>
                    </div>
                  </div>

                  {/* Auto Response Toggle */}
                  <div className="mt-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={clientSettings.autoResponse}
                        onChange={(e) => setClientSettings({...clientSettings, autoResponse: e.target.checked})}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        Enable automatic AI responses
                      </span>
                    </label>
                  </div>

                  {/* Response Delay */}
                  {clientSettings.autoResponse && (
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Response Delay (minutes)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={60}
                        value={clientSettings.responseDelay}
                        onChange={(e) => setClientSettings({...clientSettings, responseDelay: parseInt(e.target.value || '0', 10)})}
                        className="w-24 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">Wait time before sending AI response</p>
                    </div>
                  )}
                </div>

                {/* Email Signature */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Signature
                  </label>
                  <textarea
                    value={clientSettings.signature}
                    onChange={(e) => setClientSettings({...clientSettings, signature: e.target.value})}
                    rows={4}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Best regards,&#10;John Doe&#10;CEO, Company Name&#10;phone@email.com"
                  />
                </div>

                {/* Sample Emails */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <label className="block text-sm font-medium text-gray-700">
                      Sample Emails (for AI training)
                    </label>
                    <button
                      onClick={addSampleEmail}
                      type="button"
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      + Add Sample
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    {clientSettings.sampleEmails.map((email, index) => (
                      <div key={index} className="relative">
                        <textarea
                          value={email}
                          onChange={(e) => updateSampleEmail(index, e.target.value)}
                          rows={4}
                          className="w-full border border-gray-300 rounded-md px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder={`Sample email ${index + 1} - paste an example email you've written to train the AI on your style`}
                        />
                        {clientSettings.sampleEmails.length > 1 && (
                          <button
                            onClick={() => removeSampleEmail(index)}
                            type="button"
                            className="absolute top-2 right-2 text-red-500 hover:text-red-700"
                            aria-label="Remove sample"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Add examples of your typical emails to help the AI match your writing style
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-3 mt-8 pt-6 border-t">
                <button
                  onClick={() => setShowManageModal(false)}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveClientSettings}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
