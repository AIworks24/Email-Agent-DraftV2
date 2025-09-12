'use client';

import React, { useState, useEffect } from 'react';

export default function AIEmailAgentApp() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [systemStatus, setSystemStatus] = useState('Checking...');

  useEffect(() => {
    checkSystemHealth();
  }, []);

  const checkSystemHealth = async () => {
    try {
      const response = await fetch('/api/health');
      if (response.ok) {
        setSystemStatus('Online');
      } else {
        setSystemStatus('Error');
      }
    } catch (error) {
      setSystemStatus('Error');
    }
  };

  const buttonStyle = {
    padding: '8px 16px',
    margin: '0 4px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px'
  };

  const activeButtonStyle = {
    ...buttonStyle,
    backgroundColor: '#3b82f6',
    color: 'white'
  };

  const inactiveButtonStyle = {
    ...buttonStyle,
    backgroundColor: '#f3f4f6',
    color: '#374151'
  };

  const containerStyle = {
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
    fontFamily: 'Arial, sans-serif'
  };

  const headerStyle = {
    backgroundColor: 'white',
    borderBottom: '1px solid #e5e7eb',
    padding: '16px'
  };

  const contentStyle = {
    padding: '24px',
    maxWidth: '1200px',
    margin: '0 auto'
  };

  const cardStyle = {
    backgroundColor: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '24px',
    marginBottom: '24px'
  };

  const statusStyle = {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 'bold',
    backgroundColor: systemStatus === 'Online' ? '#dcfce7' : '#fee2e2',
    color: systemStatus === 'Online' ? '#166534' : '#991b1b'
  };

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>AI Email Agent</h1>
            
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setActiveTab('dashboard')}
                style={activeTab === 'dashboard' ? activeButtonStyle : inactiveButtonStyle}
              >
                Dashboard
              </button>
              <button
                onClick={() => setActiveTab('setup')}
                style={activeTab === 'setup' ? activeButtonStyle : inactiveButtonStyle}
              >
                Setup
              </button>
              <button
                onClick={() => setActiveTab('clients')}
                style={activeTab === 'clients' ? activeButtonStyle : inactiveButtonStyle}
              >
                Clients
              </button>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: systemStatus === 'Online' ? '#22c55e' : '#ef4444'
            }}></div>
            <span style={{ fontSize: '14px', color: '#6b7280' }}>
              System: {systemStatus}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={contentStyle}>
        {activeTab === 'dashboard' && (
          <div>
            <div style={cardStyle}>
              <h2 style={{ margin: '0 0 16px 0', fontSize: '20px' }}>Email Processing Dashboard</h2>
              <p style={{ margin: '0 0 16px 0', color: '#6b7280' }}>
                Monitor and manage AI-powered email responses
              </p>
              <div style={statusStyle}>System Status: {systemStatus}</div>
            </div>
            
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 16px 0' }}>Quick Actions</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <button
                  onClick={() => window.open('/api/health', '_blank')}
                  style={{
                    ...buttonStyle,
                    backgroundColor: '#10b981',
                    color: 'white',
                    padding: '16px',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ fontWeight: 'bold' }}>Test API Health</div>
                  <div style={{ fontSize: '12px', opacity: 0.8 }}>Check system endpoints</div>
                </button>
                
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
          <div>
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
            </div>
          </div>
        )}

        {activeTab === 'clients' && (
          <div>
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