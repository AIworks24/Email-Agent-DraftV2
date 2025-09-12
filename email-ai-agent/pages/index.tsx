import { useState } from 'react';
import ClientDashboard from '../components/ClientDashboard';

export default function Home() {
  const [currentView, setCurrentView] = useState('dashboard');

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">
                AI Email Agent
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setCurrentView('dashboard')}
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  currentView === 'dashboard'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Dashboard
              </button>
              <button
                onClick={() => setCurrentView('setup')}
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  currentView === 'setup'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Setup
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main>
        {currentView === 'dashboard' && <ClientDashboard />}
        {currentView === 'setup' && (
          <div className="p-6 max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">Setup Instructions</h2>
            <div className="bg-white p-6 rounded-lg shadow space-y-4">
              <div>
                <h3 className="font-semibold text-lg">Test API Endpoints:</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  <li>• <strong>Setup Webhooks:</strong> POST to <code>/api/setup-webhooks</code></li>
                  <li>• <strong>Process Emails:</strong> POST to <code>/api/process-emails</code></li>
                  <li>• <strong>Renew Webhooks:</strong> POST to <code>/api/renew-webhooks</code></li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-lg">Next Steps:</h3>
                <ol className="mt-2 space-y-1 text-sm list-decimal list-inside">
                  <li>Add clients and email accounts to Supabase</li>
                  <li>Create email templates for each client</li>
                  <li>Test webhook setup</li>
                  <li>Monitor the dashboard for email processing</li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}