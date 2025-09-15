'use client';

import { useState, useEffect } from 'react';

interface Client {
  id: string;
  name: string;
  email: string;
  status: string;
  stats: {
    totalEmails: number;
  };
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
              <button style={{
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
                    onClick={() => setActiveTab('clients')}
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
              <button style={{
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
                      <button style={{
                        ...buttonStyle,
                        backgroundColor: '#f3f4f6',
                        color: '#374151',
                        padding: '8px 12px'
                      }}>
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
    </div>
  );
}