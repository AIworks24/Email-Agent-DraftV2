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
  created_at: string;
  updated_at?: string;
  emails_processed?: number;
  stats?: {
    totalEmails?: number;
    draftsCreated?: number;
    errors?: number;
  };
  settings?: {
    writingStyle?: string;
    tone?: string;
    signature?: string;
    sampleEmails?: string[];
    autoResponse?: boolean;
    responseDelay?: number;
  };
}

interface EmailStats {
  totalEmails: number;
  draftsCreated: number;
  emailsSent: number;
  activeClients: number;
}

interface EmailLog {
  id: string;
  created_at: string;
  subject?: string;
  from_email?: string;
  sender_email?: string; // some APIs return this field name
  status: string;
  ai_response?: string | null;
  client?: { name?: string | null } | null;
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

  // ===== NEW: Live email monitoring state =====
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);

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

  // ===== NEW: Fetch recent email processing logs =====
  const fetchEmailLogs = async () => {
    try {
      setRefreshing(true);
      const response = await fetch('/api/email-logs');
      if (response.ok) {
        const data = await response.json();
        setEmailLogs((data?.logs as EmailLog[]) || []);
      }
    } catch (error) {
      console.error('Error fetching email logs:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // ===== NEW: Auto-refresh logs every 30s while on Dashboard tab =====
  useEffect(() => {
    if (activeTab === 'dashboard') {
      fetchEmailLogs();
      const interval = setInterval(fetchEmailLogs, 30000); // 30s
      return () => clearInterval(interval);
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ===== Manage Client modal state =====
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

  // ===== Handlers for Manage modal =====
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

            {/* ===== NEW: Live Email Processing (after stats cards) ===== */}
            <div className="bg-white rounded-lg shadow mb-6">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Live Email Processing
                  </h2>
                  <button
                    onClick={fetchEmailLogs}
                    disabled={refreshing}
                    className={`px-3 py-1 text-sm rounded-md ${
                      refreshing 
                        ? 'bg-gray-100 text-gray-400' 
                        : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    }`}
                  >
                    {refreshing ? 'Refreshing...' : 'Refresh'}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                {emailLogs.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <p className="text-lg">No email activity yet</p>
                    <p className="text-sm mt-1">Email processing logs will appear here when clients receive emails</p>
                  </div>
                ) : (
                  <table className="min-w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Time
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Client
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Subject
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          From
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          AI Response
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {emailLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {log.client?.name || 'Unknown'}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                            {log.subject || 'No subject'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {log.sender_email || log.from_email || ''}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              log.status === 'draft_created' ? 'bg-green-100 text-green-800' :
                              log.status === 'manual_review_required' ? 'bg-yellow-100 text-yellow-800' :
                              log.status === 'error' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {log.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {log.ai_response ? (
                              <button
                                onClick={() => alert(log.ai_response)}
                                className="text-blue-600 hover:text-blue-900"
                              >
                                View Response
                              </button>
                            ) : (
                              <span className="text-gray-400">No response</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Activity Section (kept) */}
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

      {/* Remove the AI testing and update the modal for production use
          Replace your modal JSX with this production-ready version: */}
      {showManageModal && selectedClient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-8 py-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    Manage Client: {selectedClient.name}
                  </h2>
                  <p className="text-gray-600 mt-1">{selectedClient.email}</p>
                </div>
                <button
                  onClick={() => setShowManageModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-white rounded-lg"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto px-8 py-6">
              {/* Client Status Card */}
              <div className="bg-gradient-to-r from-green-50 to-blue-50 p-6 rounded-xl mb-8 border border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{selectedClient.emails_processed ?? 0}</div>
                    <div className="text-sm text-gray-600">Emails Processed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {clientSettings.autoResponse ? 'Active' : 'Disabled'}
                    </div>
                    <div className="text-sm text-gray-600">AI Status</div>
                  </div>
                  <div className="text-center">
                    <span className={`inline-flex px-4 py-2 rounded-full text-sm font-medium ${
                      selectedClient.status === 'active' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {selectedClient.status?.charAt(0).toUpperCase() + selectedClient.status?.slice(1)}
                    </span>
                  </div>
                </div>
              </div>

              {/* AI Response Settings */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
                <h3 className="text-xl font-semibold mb-6 text-gray-900 flex items-center">
                  <svg className="w-6 h-6 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  AI Response Settings
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Writing Style */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-3">
                      Writing Style
                    </label>
                    <select
                      value={clientSettings.writingStyle}
                      onChange={(e) => setClientSettings({...clientSettings, writingStyle: e.target.value})}
                      className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
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
                    <label className="block text-sm font-semibold text-gray-700 mb-3">
                      Tone
                    </label>
                    <select
                      value={clientSettings.tone}
                      onChange={(e) => setClientSettings({...clientSettings, tone: e.target.value})}
                      className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      <option value="friendly">Friendly</option>
                      <option value="professional">Professional</option>
                      <option value="enthusiastic">Enthusiastic</option>
                      <option value="neutral">Neutral</option>
                      <option value="empathetic">Empathetic</option>
                    </select>
                  </div>
                </div>

                {/* Auto Response Settings */}
                <div className="mt-8 p-6 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="font-semibold text-gray-900">Automatic AI Responses</h4>
                      <p className="text-sm text-gray-600">Enable AI to automatically create draft responses to incoming emails</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={clientSettings.autoResponse}
                        onChange={(e) => setClientSettings({...clientSettings, autoResponse: e.target.checked})}
                        className="sr-only peer"
                      />
                      <div className="w-14 h-8 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-6 peer-checked:after:border-white after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  {clientSettings.autoResponse && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Response Delay (minutes)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="60"
                          value={clientSettings.responseDelay}
                          onChange={(e) => setClientSettings({...clientSettings, responseDelay: parseInt(e.target.value)})}
                          className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <p className="text-xs text-gray-500 mt-1">Wait time before creating draft response</p>
                      </div>
                      <div className="flex items-center">
                        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                          <p className="text-sm text-green-700">
                            <strong>Live Mode:</strong> AI will automatically create draft responses in Outlook for all incoming emails
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Email Signature */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
                <h3 className="text-lg font-semibold mb-4 text-gray-900 flex items-center">
                  <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  Email Signature
                </h3>
                <textarea
                  value={clientSettings.signature}
                  onChange={(e) => setClientSettings({...clientSettings, signature: e.target.value})}
                  rows={5}
                  className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Best regards,&#10;John Doe&#10;CEO, Company Name&#10;phone@email.com"
                />
              </div>

              {/* Sample Emails */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                    </svg>
                    Email Writing Examples
                  </h3>
                  <button
                    onClick={addSampleEmail}
                    type="button"
                    className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors font-medium"
                  >
                    + Add Example
                  </button>
                </div>
                
                <div className="space-y-4">
                  {clientSettings.sampleEmails.map((email, index) => (
                    <div key={index} className="relative">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Writing Example #{index + 1}
                      </label>
                      <textarea
                        value={email}
                        onChange={(e) => updateSampleEmail(index, e.target.value)}
                        rows={6}
                        className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        placeholder={`Paste an example email you've written so the AI can learn your style...`}
                      />
                      {clientSettings.sampleEmails.length > 1 && (
                        <button
                          onClick={() => removeSampleEmail(index)}
                          type="button"
                          className="absolute top-8 right-3 text-red-500 hover:text-red-700 bg-white rounded-full p-1 shadow-sm"
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-sm text-gray-500 mt-4 bg-blue-50 p-3 rounded-lg">
                  <strong>How it works:</strong> Add 2-3 examples of emails you've written. The AI will learn your writing style, tone, and common phrases to create responses that sound like you.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-6 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
              <div className="text-sm text-gray-500">
                Changes take effect immediately for new incoming emails
              </div>
              <div className="flex space-x-4">
                <button
                  onClick={() => setShowManageModal(false)}
                  className="px-6 py-3 text-gray-600 border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={saveClientSettings}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-lg"
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
