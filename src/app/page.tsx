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
  sender_email?: string;
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

  // Live email monitoring state
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

  // Fetch recent email processing logs
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

  // Auto-refresh logs every 30s while on Dashboard tab
  useEffect(() => {
    if (activeTab === 'dashboard') {
      fetchEmailLogs();
      const interval = setInterval(fetchEmailLogs, 30000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  const initiateClientRegistration = async () => {
    try {
      console.log('Starting Microsoft Graph OAuth flow...');
      
      const tempClientId = `temp-${Date.now()}`;
      const returnUrl = encodeURIComponent(window.location.pathname);
      
      const authUrl = `/api/auth/signin?clientId=${tempClientId}&returnUrl=${returnUrl}`;
      console.log('Redirecting to:', authUrl);
      
      window.location.href = authUrl;
      
    } catch (error) {
      console.error('Registration error:', error);
      alert('Failed to start client registration. Please check the console for details.');
    }
  };

  // Manage Client modal state
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showManageModal, setShowManageModal] = useState(false);
  const [clientSettings, setClientSettings] = useState<ClientSettings>({
    writingStyle: 'professional',
    tone: 'friendly',
    signature: '',
    sampleEmails: [''],
    autoResponse: true,
    responseDelay: 5
  });

  // Handlers for Manage modal
  const handleManageClient = (client: Client) => {
    console.log('Managing client:', client);
    setSelectedClient(client);
    
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

  // Styles
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

  const inputStyle = {
    width: '100%',
    border: '2px solid #e5e7eb',
    borderRadius: '6px',
    padding: '12px 16px',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s ease'
  };

  const selectStyle = {
    ...inputStyle,
    backgroundColor: 'white',
    cursor: 'pointer'
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

            {/* Live Email Processing */}
            <div style={cardStyle}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
                paddingBottom: '16px',
                borderBottom: '1px solid #e5e7eb'
              }}>
                <h2 style={{
                  fontSize: '18px',
                  fontWeight: '600',
                  margin: 0,
                  color: '#111827'
                }}>
                  Live Email Processing
                </h2>
                <button
                  onClick={fetchEmailLogs}
                  disabled={refreshing}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    borderRadius: '4px',
                    border: 'none',
                    cursor: refreshing ? 'not-allowed' : 'pointer',
                    backgroundColor: refreshing ? '#f3f4f6' : '#dbeafe',
                    color: refreshing ? '#9ca3af' : '#1d4ed8'
                  }}
                >
                  {refreshing ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                {emailLogs.length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '48px 24px',
                    color: '#6b7280'
                  }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📧</div>
                    <p style={{ fontSize: '18px', margin: '0 0 8px 0' }}>No email activity yet</p>
                    <p style={{ fontSize: '14px', margin: 0 }}>
                      Email processing logs will appear here when clients receive emails
                    </p>
                  </div>
                ) : (
                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse' as const
                  }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f9fafb' }}>
                        <th style={{
                          padding: '12px',
                          textAlign: 'left' as const,
                          fontSize: '12px',
                          fontWeight: '500',
                          color: '#6b7280',
                          textTransform: 'uppercase' as const,
                          letterSpacing: '0.05em'
                        }}>Time</th>
                        <th style={{
                          padding: '12px',
                          textAlign: 'left' as const,
                          fontSize: '12px',
                          fontWeight: '500',
                          color: '#6b7280',
                          textTransform: 'uppercase' as const,
                          letterSpacing: '0.05em'
                        }}>Client</th>
                        <th style={{
                          padding: '12px',
                          textAlign: 'left' as const,
                          fontSize: '12px',
                          fontWeight: '500',
                          color: '#6b7280',
                          textTransform: 'uppercase' as const,
                          letterSpacing: '0.05em'
                        }}>Subject</th>
                        <th style={{
                          padding: '12px',
                          textAlign: 'left' as const,
                          fontSize: '12px',
                          fontWeight: '500',
                          color: '#6b7280',
                          textTransform: 'uppercase' as const,
                          letterSpacing: '0.05em'
                        }}>From</th>
                        <th style={{
                          padding: '12px',
                          textAlign: 'left' as const,
                          fontSize: '12px',
                          fontWeight: '500',
                          color: '#6b7280',
                          textTransform: 'uppercase' as const,
                          letterSpacing: '0.05em'
                        }}>Status</th>
                        <th style={{
                          padding: '12px',
                          textAlign: 'left' as const,
                          fontSize: '12px',
                          fontWeight: '500',
                          color: '#6b7280',
                          textTransform: 'uppercase' as const,
                          letterSpacing: '0.05em'
                        }}>AI Response</th>
                      </tr>
                    </thead>
                    <tbody>
                      {emailLogs.map((log) => (
                        <tr key={log.id} style={{
                          backgroundColor: 'white',
                          borderBottom: '1px solid #e5e7eb'
                        }}>
                          <td style={{
                            padding: '12px',
                            fontSize: '14px',
                            color: '#374151'
                          }}>
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td style={{
                            padding: '12px',
                            fontSize: '14px',
                            fontWeight: '500',
                            color: '#111827'
                          }}>
                            {log.client?.name || 'Unknown'}
                          </td>
                          <td style={{
                            padding: '12px',
                            fontSize: '14px',
                            color: '#374151',
                            maxWidth: '200px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap' as const
                          }}>
                            {log.subject || 'No subject'}
                          </td>
                          <td style={{
                            padding: '12px',
                            fontSize: '14px',
                            color: '#374151'
                          }}>
                            {log.sender_email || log.from_email || ''}
                          </td>
                          <td style={{ padding: '12px' }}>
                            <span style={{
                              padding: '4px 8px',
                              fontSize: '12px',
                              fontWeight: '500',
                              borderRadius: '16px',
                              backgroundColor: 
                                log.status === 'draft_created' ? '#dcfce7' :
                                log.status === 'manual_review_required' ? '#fef3c7' :
                                log.status === 'error' ? '#fee2e2' :
                                '#f3f4f6',
                              color:
                                log.status === 'draft_created' ? '#166534' :
                                log.status === 'manual_review_required' ? '#92400e' :
                                log.status === 'error' ? '#991b1b' :
                                '#374151'
                            }}>
                              {log.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td style={{ padding: '12px' }}>
                            {log.ai_response ? (
                              <button
                                onClick={() => alert(log.ai_response)}
                                style={{
                                  color: '#2563eb',
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '14px',
                                  textDecoration: 'underline'
                                }}
                              >
                                View Response
                              </button>
                            ) : (
                              <span style={{ color: '#9ca3af', fontSize: '14px' }}>No response</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
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
              <h2 style={{ 
                margin: 0, 
                fontSize: '20px', 
                fontWeight: '600',
                color: '#111827'
              }}>
                Client Management
              </h2>
              <button 
                onClick={initiateClientRegistration}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}>
                + Add New Client
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                Loading clients...
              </div>
            ) : clients.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '40px',
                backgroundColor: '#f9fafb',
                borderRadius: '8px',
                border: '1px solid #e5e7eb'
              }}>
                <p style={{ color: '#6b7280', margin: 0 }}>No clients added yet</p>
              </div>
            ) : (
              <div>
                {clients.map((client) => (
                  <div key={client.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px',
                    marginBottom: '12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    backgroundColor: 'white'
                  }}>
                    <div>
                      <div style={{ 
                        fontWeight: '600', 
                        fontSize: '16px',
                        color: '#111827',
                        marginBottom: '4px'
                      }}>
                        {client.name}
                      </div>
                      <div style={{ 
                        fontSize: '14px', 
                        color: '#6b7280',
                        marginBottom: '2px'
                      }}>
                        {client.email}
                      </div>
                      <div style={{ 
                        fontSize: '12px', 
                        color: '#9ca3af' 
                      }}>
                        {client.emails_processed || 0} emails processed
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: '500',
                        backgroundColor: client.status === 'active' ? '#dcfce7' : '#f3f4f6',
                        color: client.status === 'active' ? '#16a34a' : '#6b7280'
                      }}>
                        {client.status}
                      </span>

                      <button
                        onClick={() => handleManageClient(client)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: 'transparent',
                          color: '#3b82f6',
                          border: '1px solid #e5e7eb',
                          borderRadius: '4px',
                          fontSize: '14px',
                          cursor: 'pointer'
                        }}
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

      {/* Manage Client Modal - Fixed with Inline Styles */}
      {showManageModal && selectedClient && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            width: '100%',
            maxWidth: '800px',
            maxHeight: '95vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '24px',
              borderBottom: '1px solid #e5e7eb',
              background: 'linear-gradient(to right, #eff6ff, #eef2ff)'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <h2 style={{
                    fontSize: '20px',
                    fontWeight: 'bold',
                    color: '#111827',
                    margin: 0
                  }}>
                    Manage Client: {selectedClient.name}
                  </h2>
                  <p style={{
                    color: '#6b7280',
                    margin: '4px 0 0 0',
                    fontSize: '14px'
                  }}>
                    {selectedClient.email}
                  </p>
                </div>
                <button
                  onClick={() => setShowManageModal(false)}
                  style={{
                    color: '#9ca3af',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '8px',
                    borderRadius: '6px',
                    fontSize: '20px'
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Content - Scrollable */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '24px'
            }}>
              {/* Client Status Overview */}
              <div style={{
                background: 'linear-gradient(to right, #f0fdf4, #eff6ff)',
                padding: '20px',
                borderRadius: '12px',
                marginBottom: '24px',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '20px',
                  textAlign: 'center' as const
                }}>
                  <div>
                    <div style={{
                      fontSize: '24px',
                      fontWeight: 'bold',
                      color: '#059669'
                    }}>
                      {selectedClient.emails_processed ?? 0}
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: '#6b7280'
                    }}>
                      Emails Processed
                    </div>
                  </div>
                  <div>
                    <div style={{
                      fontSize: '24px',
                      fontWeight: 'bold',
                      color: '#2563eb'
                    }}>
                      {clientSettings.autoResponse ? 'Active' : 'Disabled'}
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: '#6b7280'
                    }}>
                      AI Status
                    </div>
                  </div>
                  <div>
                    <span style={{
                      display: 'inline-flex',
                      padding: '6px 12px',
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: '500',
                      backgroundColor: selectedClient.status === 'active' ? '#dcfce7' : '#f3f4f6',
                      color: selectedClient.status === 'active' ? '#16a34a' : '#6b7280'
                    }}>
                      {selectedClient.status?.charAt(0).toUpperCase() + selectedClient.status?.slice(1)}
                    </span>
                  </div>
                </div>
              </div>

              {/* AI Response Settings */}
              <div style={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '20px'
              }}>
                <h3 style={{
                  fontSize: '18px',
                  fontWeight: '600',
                  marginBottom: '20px',
                  color: '#111827',
                  display: 'flex',
                  alignItems: 'center'
                }}>
                  🤖 AI Response Settings
                </h3>
                
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '20px'
                }}>
                  {/* Writing Style */}
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#374151',
                      marginBottom: '8px'
                    }}>
                      Writing Style
                    </label>
                    <select
                      value={clientSettings.writingStyle}
                      onChange={(e) => setClientSettings({...clientSettings, writingStyle: e.target.value})}
                      style={selectStyle}
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
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#374151',
                      marginBottom: '8px'
                    }}>
                      Tone
                    </label>
                    <select
                      value={clientSettings.tone}
                      onChange={(e) => setClientSettings({...clientSettings, tone: e.target.value})}
                      style={selectStyle}
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
                <div style={{
                  marginTop: '24px',
                  padding: '20px',
                  backgroundColor: '#f9fafb',
                  borderRadius: '8px'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px'
                  }}>
                    <div>
                      <h4 style={{
                        fontWeight: '600',
                        color: '#111827',
                        margin: 0,
                        fontSize: '16px'
                      }}>
                        Automatic AI Responses
                      </h4>
                      <p style={{
                        fontSize: '14px',
                        color: '#6b7280',
                        margin: '4px 0 0 0'
                      }}>
                        Enable AI to automatically create draft responses to incoming emails
                      </p>
                    </div>
                    <label style={{
                      position: 'relative',
                      display: 'inline-flex',
                      alignItems: 'center',
                      cursor: 'pointer'
                    }}>
                      <input
                        type="checkbox"
                        checked={clientSettings.autoResponse}
                        onChange={(e) => setClientSettings({...clientSettings, autoResponse: e.target.checked})}
                        style={{ display: 'none' }}
                      />
                      <div style={{
                        width: '48px',
                        height: '28px',
                        backgroundColor: clientSettings.autoResponse ? '#2563eb' : '#d1d5db',
                        borderRadius: '14px',
                        position: 'relative',
                        transition: 'background-color 0.2s'
                      }}>
                        <div style={{
                          width: '20px',
                          height: '20px',
                          backgroundColor: 'white',
                          borderRadius: '50%',
                          position: 'absolute',
                          top: '4px',
                          left: clientSettings.autoResponse ? '24px' : '4px',
                          transition: 'left 0.2s'
                        }} />
                      </div>
                    </label>
                  </div>

                  {clientSettings.autoResponse && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '16px'
                    }}>
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '14px',
                          fontWeight: '600',
                          color: '#374151',
                          marginBottom: '8px'
                        }}>
                          Response Delay (minutes)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="60"
                          value={clientSettings.responseDelay}
                          onChange={(e) => setClientSettings({...clientSettings, responseDelay: parseInt(e.target.value)})}
                          style={inputStyle}
                        />
                        <p style={{
                          fontSize: '12px',
                          color: '#6b7280',
                          margin: '4px 0 0 0'
                        }}>
                          Wait time before creating draft response
                        </p>
                      </div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center'
                      }}>
                        <div style={{
                          backgroundColor: '#dcfce7',
                          padding: '12px',
                          borderRadius: '8px',
                          border: '1px solid #bbf7d0'
                        }}>
                          <p style={{
                            fontSize: '14px',
                            color: '#166534',
                            margin: 0
                          }}>
                            <strong>Live Mode:</strong> AI will automatically create draft responses in Outlook for all incoming emails
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Email Signature */}
              <div style={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '20px'
              }}>
                <h3 style={{
                  fontSize: '16px',
                  fontWeight: '600',
                  marginBottom: '16px',
                  color: '#111827',
                  display: 'flex',
                  alignItems: 'center'
                }}>
                  ✍️ Email Signature
                </h3>
                <textarea
                  value={clientSettings.signature}
                  onChange={(e) => setClientSettings({...clientSettings, signature: e.target.value})}
                  rows={4}
                  style={{
                    ...inputStyle,
                    resize: 'vertical' as const,
                    fontFamily: 'monospace'
                  }}
                  placeholder="Best regards,&#10;John Doe&#10;CEO, Company Name&#10;phone@email.com"
                />
              </div>

              {/* Sample Emails */}
              <div style={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '20px'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '20px'
                }}>
                  <h3 style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#111827',
                    margin: 0,
                    display: 'flex',
                    alignItems: 'center'
                  }}>
                    📝 Email Writing Examples
                  </h3>
                  <button
                    onClick={addSampleEmail}
                    type="button"
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#dbeafe',
                      color: '#1d4ed8',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    + Add Example
                  </button>
                </div>
                
                <div style={{ marginBottom: '16px' }}>
                  {clientSettings.sampleEmails.map((email, index) => (
                    <div key={index} style={{
                      position: 'relative',
                      marginBottom: '16px'
                    }}>
                      <label style={{
                        display: 'block',
                        fontSize: '14px',
                        fontWeight: '500',
                        color: '#374151',
                        marginBottom: '8px'
                      }}>
                        Writing Example #{index + 1}
                      </label>
                      <textarea
                        value={email}
                        onChange={(e) => updateSampleEmail(index, e.target.value)}
                        rows={5}
                        style={{
                          ...inputStyle,
                          paddingRight: clientSettings.sampleEmails.length > 1 ? '40px' : '16px',
                          resize: 'vertical' as const
                        }}
                        placeholder="Paste an example email you've written so the AI can learn your style..."
                      />
                      {clientSettings.sampleEmails.length > 1 && (
                        <button
                          onClick={() => removeSampleEmail(index)}
                          type="button"
                          style={{
                            position: 'absolute',
                            top: '32px',
                            right: '8px',
                            color: '#ef4444',
                            background: 'white',
                            border: 'none',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            cursor: 'pointer',
                            fontSize: '16px',
                            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{
                  fontSize: '14px',
                  color: '#6b7280',
                  backgroundColor: '#eff6ff',
                  padding: '12px',
                  borderRadius: '8px'
                }}>
                  <strong>How it works:</strong> Add 2-3 examples of emails you've written. The AI will learn your writing style, tone, and common phrases to create responses that sound like you.
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '20px 24px',
              backgroundColor: '#f9fafb',
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{
                fontSize: '14px',
                color: '#6b7280'
              }}>
                Changes take effect immediately for new incoming emails
              </div>
              <div style={{
                display: 'flex',
                gap: '12px'
              }}>
                <button
                  onClick={() => setShowManageModal(false)}
                  style={{
                    padding: '10px 20px',
                    color: '#6b7280',
                    border: '2px solid #e5e7eb',
                    borderRadius: '6px',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={saveClientSettings}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
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