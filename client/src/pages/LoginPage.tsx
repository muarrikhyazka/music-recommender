import React from 'react';

const LoginPage: React.FC = () => {
  const handleSpotifyLogin = async () => {
    try {
      const response = await fetch('/api/auth/spotify');
      const data = await response.json();
      
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        console.error('No auth URL received from server');
      }
    } catch (error) {
      console.error('Error initiating Spotify login:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-spotify-green to-green-600 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="card p-8 text-center">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">🎵 Munder</h1>
            <p className="text-gray-600">Your personalized music companion</p>
          </div>
          
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Welcome</h2>
            <p className="text-gray-600 text-sm">
              Get music recommendations based on your location, weather, and time of day
            </p>
          </div>
          
          <button
            onClick={handleSpotifyLogin}
            className="w-full bg-spotify-green hover:bg-green-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 14.5c-.17 0-.33-.07-.44-.2-1.27-1.07-2.87-1.66-4.5-1.66-1.06 0-2.06.18-2.97.53-.14.05-.3.05-.44-.01-.14-.05-.25-.15-.31-.28-.06-.13-.06-.28.01-.41.06-.13.17-.23.31-.28 1.06-.4 2.22-.61 3.4-.61 1.89 0 3.75.68 5.24 1.92.13.11.21.27.21.44 0 .17-.07.33-.2.44-.11.11-.26.17-.41.17l.1-.05zm.7-1.6c-.2 0-.4-.08-.54-.24-1.51-1.27-3.41-1.97-5.35-1.97-1.26 0-2.45.2-3.54.6-.17.07-.36.07-.53-.01-.17-.07-.3-.2-.37-.37-.07-.17-.07-.36.01-.53.07-.17.2-.3.37-.37 1.27-.46 2.65-.7 4.06-.7 2.25 0 4.45.81 6.21 2.28.15.13.24.32.24.51 0 .2-.08.39-.23.53-.14.14-.33.22-.53.22l.2-.05zm.9-1.9c-.23 0-.46-.1-.61-.28-1.8-1.51-4.05-2.34-6.34-2.34-1.5 0-2.93.24-4.25.72-.2.07-.42.07-.62-.02-.2-.08-.36-.23-.44-.42-.08-.19-.08-.41.02-.6.08-.19.23-.35.42-.44 1.54-.56 3.21-.84 4.97-.84 2.67 0 5.28.97 7.37 2.72.18.15.28.37.28.6 0 .23-.1.45-.28.6-.17.15-.39.23-.61.23l.09-.03z"/>
            </svg>
            <span>Connect with Spotify</span>
          </button>
          
          <div className="mt-6 text-xs text-gray-500">
            <p>We'll use your Spotify account to create personalized playlists</p>
          </div>
        </div>
        
        <div className="mt-6 text-center text-white/80">
          <p className="text-sm">🌤️ Weather-aware • 📍 Location-based • ⏰ Time-conscious</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;