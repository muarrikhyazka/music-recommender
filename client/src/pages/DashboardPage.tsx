import React, { useState, useEffect } from 'react';
import apiService from '../services/api.ts';
import locationService from '../utils/location';
import LoadingSpinner from '../components/LoadingSpinner';

interface Track {
  id: string;
  name: string;
  artists: Array<{ name: string; id: string }>;
  album: { name: string; images: Array<{ url: string }> };
  uri: string;
  duration?: number;
  score?: number;
  reasons?: string[];
}

interface WeatherData {
  condition: string;
  temperature: number;
  feelsLike?: number;
  humidity: number;
  description?: string;
}

interface LocationData {
  city: string;
  country: string;
  region?: string;
  coordinates: {
    lat: number;
    lng: number;
  };
}

interface ContextData {
  timestamp: string;
  timeOfDay: string;
  geoLocation: LocationData;
  weather: WeatherData;
  season: string;
}

const DashboardPage: React.FC = () => {
  const [context, setContext] = useState<ContextData | null>(null);
  const [recommendations, setRecommendations] = useState<Track[]>([]);
  const [playlistName, setPlaylistName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getWeatherEmoji = (condition: string) => {
    const weatherEmojis: { [key: string]: string } = {
      sunny: '☀️',
      cloudy: '☁️',
      rainy: '🌧️',
      stormy: '⛈️',
      snow: '❄️',
      fog: '🌫️',
      partly_cloudy: '⛅',
      unknown: '🌤️'
    };
    return weatherEmojis[condition] || weatherEmojis.unknown;
  };

  const getTimeEmoji = (timeOfDay: string) => {
    const timeEmojis: { [key: string]: string } = {
      morning: '🌅',
      afternoon: '☀️',
      evening: '🌆',
      night: '🌙'
    };
    return timeEmojis[timeOfDay] || '🎵';
  };

  const formatDuration = (milliseconds: number) => {
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get user location
        let userLocation;
        try {
          const location = await locationService.getCurrentPosition({
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 300000 // 5 minutes
          });
          userLocation = {
            latitude: location.latitude,
            longitude: location.longitude
          };
        } catch (locationError) {
          console.log('Could not get precise location, using IP-based location');
          // Location will be detected server-side from IP
        }

        // Get current context (includes weather, location, time)
        const contextData = await apiService.getCurrentContext(userLocation);
        setContext(contextData);

        // Get recommendations based on context
        const recommendationData = await apiService.previewRecommendations({
          context: contextData,
          userLocation,
          targetLength: 20,
          diversityWeight: 0.3
        });

        if (recommendationData.success && recommendationData.recommendations) {
          setRecommendations(recommendationData.recommendations);
          if (recommendationData.metadata?.playlistName) {
            setPlaylistName(recommendationData.metadata.playlistName);
          }
        } else {
          throw new Error(recommendationData.error || 'Failed to get recommendations');
        }

      } catch (err) {
        console.error('Error loading dashboard data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="dashboard-page flex items-center justify-center min-h-screen">
        <div className="text-center">
          <LoadingSpinner />
          <p className="mt-4 text-gray-600">Loading your personalized music dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-page flex items-center justify-center min-h-screen">
        <div className="text-center text-red-600">
          <h2 className="text-xl font-bold mb-2">Error Loading Dashboard</h2>
          <p>{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Munder Dashboard</h1>
        <p className="text-gray-600">Your personalized music recommendations</p>
      </div>

      {context && (
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {/* Location Card */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-3 flex items-center">
              📍 Location
            </h3>
            <p className="text-2xl font-bold text-gray-900">
              {context.geoLocation.city}
            </p>
            <p className="text-sm text-gray-600">
              {context.geoLocation.region && `${context.geoLocation.region}, `}
              {context.geoLocation.country}
            </p>
          </div>

          {/* Weather Card */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-3 flex items-center">
              {getWeatherEmoji(context.weather.condition)} Weather
            </h3>
            <p className="text-2xl font-bold text-gray-900">
              {context.weather.temperature}°C
            </p>
            <p className="text-sm text-gray-600 capitalize">
              {context.weather.description || context.weather.condition}
            </p>
            {context.weather.feelsLike && (
              <p className="text-xs text-gray-500">
                Feels like {context.weather.feelsLike}°C
              </p>
            )}
          </div>

          {/* Time Card */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-3 flex items-center">
              {getTimeEmoji(context.timeOfDay)} Time
            </h3>
            <p className="text-2xl font-bold text-gray-900 capitalize">
              {context.timeOfDay}
            </p>
            <p className="text-sm text-gray-600 capitalize">
              {context.season} season
            </p>
          </div>
        </div>
      )}

      {/* Recommendations Section */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              🎵 {playlistName || 'Your Recommendations'}
            </h2>
            <p className="text-gray-600">
              {recommendations.length} songs curated for your current mood and environment
            </p>
          </div>
        </div>

        {recommendations.length > 0 ? (
          <div className="space-y-4">
            {recommendations.map((track, index) => (
              <div key={track.id} className="flex items-center space-x-4 p-4 hover:bg-gray-50 rounded-lg transition-colors">
                <div className="text-gray-500 font-mono text-sm w-8">
                  {(index + 1).toString().padStart(2, '0')}
                </div>
                
                {track.album?.images?.[0] && (
                  <img 
                    src={track.album.images[0].url} 
                    alt={track.album.name}
                    className="w-12 h-12 rounded-md object-cover"
                  />
                )}
                
                <div className="flex-grow">
                  <h3 className="font-semibold text-gray-900">{track.name}</h3>
                  <p className="text-sm text-gray-600">
                    {track.artists.map(artist => artist.name).join(', ')}
                  </p>
                  {track.reasons && track.reasons.length > 0 && (
                    <p className="text-xs text-blue-600 mt-1">
                      {track.reasons.join(', ')}
                    </p>
                  )}
                </div>
                
                <div className="text-right">
                  {track.duration && (
                    <p className="text-sm text-gray-500">
                      {formatDuration(track.duration)}
                    </p>
                  )}
                  {track.score && (
                    <p className="text-xs text-green-600">
                      {Math.round(track.score * 100)}% match
                    </p>
                  )}
                </div>

                <a
                  href={track.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-500 hover:text-green-700 transition-colors"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                  </svg>
                </a>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">No recommendations available</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;