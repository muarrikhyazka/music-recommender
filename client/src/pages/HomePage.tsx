import React from 'react';
import { useAuth } from '../contexts/AuthContext.tsx';

const HomePage: React.FC = () => {
  const { login, loading } = useAuth();

  const handleSpotifyLogin = () => {
    login();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <div className="mb-8">
          <h1 className="text-6xl font-bold text-white mb-4">
            Welcome to <span className="text-green-400">Munder</span>
          </h1>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Discover your perfect playlist with AI-powered music recommendations based on your mood, weather, and context.
          </p>
        </div>
        
        <div className="mb-12">
          <button
            onClick={handleSpotifyLogin}
            disabled={loading}
            className="bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-semibold py-4 px-8 rounded-full text-lg transition-colors duration-200 shadow-lg flex items-center justify-center space-x-3 mx-auto"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 14.5c-.17 0-.33-.07-.44-.2-1.27-1.07-2.87-1.66-4.5-1.66-1.06 0-2.06.18-2.97.53-.14.05-.3.05-.44-.01-.14-.05-.25-.15-.31-.28-.06-.13-.06-.28.01-.41.06-.13.17-.23.31-.28 1.06-.4 2.22-.61 3.4-.61 1.89 0 3.75.68 5.24 1.92.13.11.21.27.21.44 0 .17-.07.33-.2.44-.11.11-.26.17-.41.17l.1-.05zm.7-1.6c-.2 0-.4-.08-.54-.24-1.51-1.27-3.41-1.97-5.35-1.97-1.26 0-2.45.2-3.54.6-.17.07-.36.07-.53-.01-.17-.07-.3-.2-.37-.37-.07-.17-.07-.36.01-.53.07-.17.2-.3.37-.37 1.27-.46 2.65-.7 4.06-.7 2.25 0 4.45.81 6.21 2.28.15.13.24.32.24.51 0 .2-.08.39-.23.53-.14.14-.33.22-.53.22l.2-.05zm.9-1.9c-.23 0-.46-.1-.61-.28-1.8-1.51-4.05-2.34-6.34-2.34-1.5 0-2.93.24-4.25.72-.2.07-.42.07-.62-.02-.2-.08-.36-.23-.44-.42-.08-.19-.08-.41.02-.6.08-.19.23-.35.42-.44 1.54-.56 3.21-.84 4.97-.84 2.67 0 5.28.97 7.37 2.72.18.15.28.37.28.6 0 .23-.1.45-.28.6-.17.15-.39.23-.61.23l.09-.03z"/>
            </svg>
            <span>{loading ? 'Connecting...' : 'Connect with Spotify'}</span>
          </button>
          
          <p className="text-gray-400 text-sm mt-4">
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