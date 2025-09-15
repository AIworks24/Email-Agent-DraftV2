'use client';

import { useState } from 'react';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const buttonStyle = {
    padding: '12px 24px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'all 0.2s ease',
    backgroundColor: '#f3f4f6',
    color: '#374151',
    marginRight: '8px',
    marginBottom: '8px'
  };

  const cardStyle = {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    border: '1px solid #e5e7eb'
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
                AI Email Agent
              </h1>
              <p style={{
                color: '#6b7280',
                margin: 0,
                fontSize: '16px'
              }}>
                Intelligent email automation powered by Claude AI
              </p>
            </div>
            <div style={{
              padding: '8px 16px',
              backgroundColor: '#10b981',
              color: 'white',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500'
            }}>
              Online
            </div>
          </div>

          {/* Navigation */}
          <div style={{ marginBottom: '24px' }}>
            <button
              onClick={() => setActiveTab('dashboard')}
              style={{
                ...buttonStyle,
                backgroundColor: activeTab === 'dashboard' ? '#3b82f6' : '#f3f4f6',
                color: activeTab === 'dashboard' ? 'white' : '#374151'
              }}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('setup')}
              style={{
                ...buttonStyle,
                backgroundColor: activeTab === 'setup' ? '#3b82f6' : '#f3f4f6',
                color: activeTab === 'setup' ? 'white' : '#374151'
              }}
            >
              Setup
            </button>
            <button
              onClick={() => setActiveTab('clients')}
              style={{
                ...buttonStyle,
                backgroundColor: activeTab === 'clients' ? '#3b82f6' : '#f3f4f6',
                color: activeTab === 'clients' ? 'white' : '#374151'
              }}
            >
              Clients
            </button>
          </div>
        </div>

        {/* Content */}
        {activeTab === 'dashboard' && (
          <div style={{ marginTop: '24px' }}>
            <div style={cardStyle}>
              <h2 style={{ margin: '0 0 16px 0' }}>System Status</h2>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px'
              }}>
                <div style={{
                  padding: '16px',
                  backgroundColor: '#f0f9ff',
                  borderRadius: '6px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0369a1' }}>
                    Ready
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    System Status
                  </div>
                </div>
                
                <div style={{
                  padding: '16px',
                  backgroundColor: '#f0fdf4',
                  borderRadius: '6px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#059669' }}>
                    0
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    Active Clients
                  </div>
                </div>

                <div style={{
                  padding: '16px',
                  backgroundColor: '#fefce8',
                  borderRadius: '6px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ca8a04' }}>
                    0
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    Emails Processed
                  </div>
                </div>
              </div>
              
              <div style={{ marginTop: '24px' }}>
                <button
                  onClick={() => setActiveTab('setup')}
                  style={{
                    ...buttonStyle,
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    padding: '16px',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ fontWeight: 'bold' }}>Configuration</div>
                  <div style={{ fontSize: '12px', opacity: 0.8 }}>Setup environment</div>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'setup' && (
          <div style={{ marginTop: '24px' }}>
            <div style={cardStyle}>
              <h2 style={{ margin: '0 0 16px 0' }}>Environment Configuration</h2>
              <p style={{ margin: '0 0 24px 0', color: '#6b7280' }}>
                Configure these environment variables in your Vercel dashboard:
              </p>
              
              <div style={{
                backgroundColor: '#f3f4f6',
                padding: '16px',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '12px',
                marginBottom: '24px'
              }}>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{`# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_key

# Anthropic API
ANTHROPIC_API_KEY=your_anthropic_api_key

# Microsoft Graph API
MICROSOFT_CLIENT_ID=your_azure_client_id
MICROSOFT_CLIENT_SECRET=your_azure_client_secret
MICROSOFT_TENANT_ID=your_azure_tenant_id

# Webhook URL
WEBHOOK_BASE_URL=https://your-vercel-app.vercel.app`}</pre>
              </div>

              <h3 style={{ margin: '24px 0 16px 0' }}>Setup Steps</h3>
              <ol style={{ paddingLeft: '20px' }}>
                <li style={{ marginBottom: '8px' }}>Go to Vercel Dashboard → Settings → Environment Variables</li>
                <li style={{ marginBottom: '8px' }}>Add each variable listed above</li>
                <li style={{ marginBottom: '8px' }}>Set up Supabase database schema</li>
                <li style={{ marginBottom: '8px' }}>Configure Azure App Registration</li>
                <li style={{ marginBottom: '8px' }}>Redeploy your application</li>
              </ol>

              <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#f0f9ff', borderRadius: '6px' }}>
                <h4 style={{ margin: '0 0 8px 0', color: '#0369a1' }}>API Test Endpoints</h4>
                <p style={{ margin: '0', fontSize: '14px', color: '#374151' }}>
                  Test your deployment: 
                  <code style={{ 
                    backgroundColor: '#e5e7eb', 
                    padding: '2px 6px', 
                    borderRadius: '3px',
                    marginLeft: '8px',
                    fontSize: '12px'
                  }}>
                    /api/webhooks/email-received
                  </code>
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'clients' && (
          <div style={{ marginTop: '24px' }}>
            <div style={cardStyle}>
              <h2 style={{ margin: '0 0 16px 0' }}>Client Management</h2>
              <p style={{ margin: '0 0 24px 0', color: '#6b7280' }}>
                Manage email automation clients
              </p>
              
              <div style={{
                border: '2px dashed #d1d5db',
                borderRadius: '8px',
                padding: '32px',
                textAlign: 'center',
                color: '#6b7280'
              }}>
                <div style={{ fontSize: '18px', marginBottom: '8px' }}>No clients configured yet</div>
                <div style={{ fontSize: '14px' }}>
                  Complete the setup configuration first, then add your first client.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}