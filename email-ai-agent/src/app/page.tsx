'use client'

import { useState } from 'react';

export default function Home() {
  const [apiTest, setApiTest] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const testAPI = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      setApiTest(data);
    } catch (error) {
      setApiTest({ error: 'API test failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center p-8 bg-white rounded-lg shadow-lg max-w-md w-full">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          🤖 AI Email Agent
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          System is running successfully!
        </p>
        
        <button 
          onClick={testAPI}
          disabled={loading}
          className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 disabled:opacity-50 mb-4"
        >
          {loading ? 'Testing...' : 'Test API'}
        </button>

        {apiTest && (
          <div className="mt-4 p-3 bg-gray-100 rounded text-sm text-left">
            <pre>{JSON.stringify(apiTest, null, 2)}</pre>
          </div>
        )}

        <div className="mt-8 text-sm text-gray-500">
          <p>✅ Next.js App Router</p>
          <p>✅ Tailwind CSS</p>
          <p>✅ API Routes</p>
        </div>
      </div>
    </div>
  );
}