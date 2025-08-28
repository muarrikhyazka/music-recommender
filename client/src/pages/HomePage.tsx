import React from 'react';
import { useAuth } from '../contexts/AuthContext.tsx';

const HomePage: React.FC = () => {
  const { login, loading } = useAuth();

  const handleLogin = () => {
    login();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <h1 className="text-6xl font-bold text-white mb-6">
          Welcome to <span className="text-green-400">Munder</span>
        </h1>
        <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
          Discover your perfect playlist with AI-powered music recommendations based on your mood, weather, and context.
        </p>
        
        <div className="space-y-6">
          <button
            onClick={handleLogin}
            disabled={loading}
            className="bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-semibold py-4 px-8 rounded-full text-lg transition-colors duration-200 shadow-lg"
          >
            {loading ? 'Connecting...' : 'Connect with Spotify'}
          </button>
          
          <p className="text-gray-400 text-sm">
            Sign in with your Spotify account to get started
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
            <div className="text-green-400 text-2xl mb-3">🎵</div>
            <h3 className="text-white font-semibold mb-2">Smart Recommendations</h3>
            <p className="text-gray-300 text-sm">Get personalized playlists based on your listening history and preferences.</p>
          </div>
          
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
            <div className="text-blue-400 text-2xl mb-3">🌤️</div>
            <h3 className="text-white font-semibold mb-2">Context-Aware</h3>
            <p className="text-gray-300 text-sm">Music that matches your mood, weather, and time of day.</p>
          </div>
          
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
            <div className="text-purple-400 text-2xl mb-3">🤖</div>
            <h3 className="text-white font-semibold mb-2">AI-Powered</h3>
            <p className="text-gray-300 text-sm">Advanced algorithms learn from your behavior to improve over time.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;