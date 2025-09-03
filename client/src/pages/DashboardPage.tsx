import React, { useState, useEffect } from 'react';
import apiService from '../services/api.ts';
import locationService from '../utils/location.ts';
import LoadingSpinner from '../components/LoadingSpinner.tsx';

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

  const getCurrentTimeOfDay = (date: Date) => {
    const hour = date.getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  };

  const getCurrentSeason = (date: Date) => {
    const month = date.getMonth() + 1; // getMonth() returns 0-11
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    if (month >= 9 && month <= 11) return 'autumn';
    return 'winter';
  };

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Debug authentication
        const token = localStorage.getItem('auth_token');
        const user = localStorage.getItem('user');
        console.log('Dashboard loading - Auth status:', {
          hasToken: !!token,
          hasUser: !!user,
          tokenPreview: token ? token.substring(0, 20) + '...' : null
        });

        // Get user location and timezone
        let userLocation;
        const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        console.log('User timezone detected:', userTimezone);
        
        try {
          const location = await locationService.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 300000 // 5 minutes
          });
          userLocation = {
            latitude: location.latitude,
            longitude: location.longitude,
            timezone: userTimezone
          };
          console.log('GPS location obtained:', userLocation);
        } catch (locationError) {
          console.log('GPS location failed, will use IP-based location:', locationError);
          userLocation = {
            timezone: userTimezone
          };
          // Location will be detected server-side from IP
        }

        // Get current context (includes weather, location, time)
        let contextData;
        let mappedContext;
        
        try {
          contextData = await apiService.getCurrentContext(userLocation);
          console.log('Context API response:', contextData);
          console.log('Raw location from API:', contextData.location);
          
          // Map server response to expected format
          const currentTime = new Date();
          const currentTimeOfDay = getCurrentTimeOfDay(currentTime);
          
          mappedContext = {
            timestamp: currentTime.toISOString(),
            timeOfDay: currentTimeOfDay, // Always use client-side time calculation
            geoLocation: {
              city: contextData.location?.city || 'Your City',
              country: contextData.location?.country || 'Your Country',
              region: contextData.location?.region,
              coordinates: {
                lat: userLocation?.latitude || 0,
                lng: userLocation?.longitude || 0
              }
            },
            weather: contextData.weather || {
              condition: 'sunny',
              temperature: 22,
              humidity: 50,
              description: 'Pleasant weather'
            },
            season: contextData.season || getCurrentSeason(currentTime)
          };
        } catch (contextError) {
          console.error('Context API failed, trying without location:', contextError);
          
          // Try getting context without specific location (will use IP)
          try {
            contextData = await apiService.getCurrentContext();
            console.log('Context API response (IP-based):', contextData);
            
            const currentTime = new Date();
            const currentTimeOfDay = getCurrentTimeOfDay(currentTime);
            
            mappedContext = {
              timestamp: currentTime.toISOString(),
              timeOfDay: currentTimeOfDay,
              geoLocation: {
                city: contextData.location?.city || 'Your City',
                country: contextData.location?.country || 'Your Country',
                region: contextData.location?.region,
                coordinates: {
                  lat: 0,
                  lng: 0
                }
              },
              weather: contextData.weather || {
                condition: 'sunny',
                temperature: 22,
                humidity: 50,
                description: 'Pleasant weather'
              },
              season: contextData.season || getCurrentSeason(currentTime)
            };
          } catch (fallbackError) {
            console.error('Both context API calls failed, using fallback:', fallbackError);
            
            // Final fallback
            const currentTime = new Date();
            const currentTimeOfDay = getCurrentTimeOfDay(currentTime);
            
            mappedContext = {
              timestamp: currentTime.toISOString(),
              timeOfDay: currentTimeOfDay,
              geoLocation: {
                city: 'Your City',
                country: 'Your Country',
                region: '',
                coordinates: {
                  lat: 0,
                  lng: 0
                }
              },
              weather: {
                condition: 'sunny',
                temperature: 22,
                humidity: 50,
                description: 'Pleasant weather'
              },
              season: getCurrentSeason(currentTime)
            };
          }
        }
        
        setContext(mappedContext);

        // Get recommendations based on context
        try {
          const recommendationData = await apiService.previewRecommendations({
            context: mappedContext,
            userLocation,
            targetLength: 20,
            diversityWeight: 0.3
          });

          if (recommendationData.success) {
            // Handle two-part recommendations
            const userRecommendations = recommendationData.fromUserPlaylists || [];
            const globalRecommendations = recommendationData.fromGlobalRecommendations || [];
            
            // Combine for display with section markers
            const combinedRecommendations = [
              ...(userRecommendations.length > 0 ? 
                [{ isSection: true, title: 'From Your Playlists', id: 'user-section' }] : []
              ),
              ...userRecommendations.map(track => ({ ...track, section: 'user' })),
              ...(globalRecommendations.length > 0 ? 
                [{ isSection: true, title: 'Discover New Music', id: 'global-section' }] : []
              ),
              ...globalRecommendations.map(track => ({ ...track, section: 'global' }))
            ];
            
            setRecommendations(combinedRecommendations);
            if (recommendationData.metadata?.playlistName) {
              setPlaylistName(recommendationData.metadata.playlistName);
            }
          } else {
            console.warn('No recommendations received:', recommendationData);
            setRecommendations([]);
            setPlaylistName('Demo Playlist');
          }
        } catch (recommendationError) {
          console.error('Recommendations API failed:', recommendationError);
          
          // If it's a 401 error, show a message about Spotify authentication
          if (recommendationError.message.includes('401')) {
            console.log('Authentication required - user may need to re-authenticate with Spotify');
            setPlaylistName('Spotify Authentication Required');
            setRecommendations([]);
          } else {
            // For other errors, show demo recommendations with two-part structure
            console.log('Using demo recommendations due to API error');
            setPlaylistName(`Demo Playlist - ${mappedContext.timeOfDay} vibes`);
            
            const demoRecommendations = [
              { isSection: true, title: 'Discover New Music', id: 'global-section' },
              {
                id: 'demo1',
                name: 'Perfect Day - Demo Song',
                artists: [{ name: 'Demo Artist', id: 'demo-artist1' }],
                album: { 
                  name: 'Context Demo', 
                  images: [{ 
                    url: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzFEQjk1NCIvPjx0ZXh0IHg9IjE1MCIgeT0iMTUwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMjQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+8J+OtSBEZW1vPC90ZXh0Pjwvc3ZnPg==' 
                  }] 
                },
                uri: 'https://open.spotify.com/playlist/37i9dQZF1DX0XUsuxWHRQd',
                duration: 240000,
                score: 0.95,
                section: 'global',
                reasons: [`Perfect for ${mappedContext.timeOfDay}`, `Matches ${mappedContext.weather.condition} weather`]
              },
              {
                id: 'demo2',
                name: `${mappedContext.timeOfDay} Vibes`,
                artists: [{ name: 'Weather Sounds', id: 'demo-artist2' }],
                album: { 
                  name: 'Atmospheric', 
                  images: [{ 
                    url: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzYzNjZmMSIvPjx0ZXh0IHg9IjE1MCIgeT0iMTUwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMjQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+8J+OtiBNdXNpYzwvdGV4dD48L3N2Zz4=' 
                  }] 
                },
                uri: 'https://open.spotify.com/playlist/37i9dQZF1DXc6IFF23C9jj',
                duration: 180000,
                score: 0.88,
                section: 'global',
                reasons: [`${mappedContext.geoLocation.city} weather`, 'Time-based selection']
              }
            ];
            
            setRecommendations(demoRecommendations);
          }
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
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 py-8">
      <div className="max-w-6xl mx-auto px-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">🎵 Munder Dashboard</h1>
        <p className="text-gray-300">Your personalized music recommendations</p>
      </div>

      {context && (
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {/* Location Card */}
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
            <h3 className="text-lg font-semibold mb-3 flex items-center text-white">
              📍 Location
            </h3>
            <p className="text-2xl font-bold text-white">
              {context.geoLocation.city}
            </p>
            <p className="text-sm text-gray-300">
              {context.geoLocation.region && `${context.geoLocation.region}, `}
              {context.geoLocation.country}
            </p>
          </div>

          {/* Weather Card */}
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
            <h3 className="text-lg font-semibold mb-3 flex items-center text-white">
              {getWeatherEmoji(context.weather.condition)} Weather
            </h3>
            <p className="text-2xl font-bold text-white">
              {context.weather.temperature}°C
            </p>
            <p className="text-sm text-gray-300 capitalize">
              {context.weather.description || context.weather.condition}
            </p>
            {context.weather.feelsLike && (
              <p className="text-xs text-gray-400">
                Feels like {context.weather.feelsLike}°C
              </p>
            )}
          </div>

          {/* Time Card */}
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
            <h3 className="text-lg font-semibold mb-3 flex items-center text-white">
              {getTimeEmoji(context.timeOfDay)} Time
            </h3>
            <p className="text-2xl font-bold text-white capitalize">
              {context.timeOfDay}
            </p>
            <p className="text-sm text-gray-300 capitalize">
              {context.season} season
            </p>
          </div>
        </div>
      )}

      {/* Recommendations Section */}
      <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">
              🎵 {playlistName || 'Your Recommendations'}
            </h2>
            <p className="text-gray-300">
              {recommendations.length} songs curated for your current mood and environment
            </p>
          </div>
        </div>

        {recommendations.length > 0 ? (
          <div className="space-y-4">
            {recommendations.map((item, index) => {
              // Render section headers
              if (item.isSection) {
                return (
                  <div key={item.id} className="flex items-center py-4">
                    <div className="flex-grow border-t border-gray-600"></div>
                    <div className="px-4">
                      <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                    </div>
                    <div className="flex-grow border-t border-gray-600"></div>
                  </div>
                );
              }

              // Render tracks
              const track = item;
              const trackNumber = recommendations.slice(0, index).filter(r => !r.isSection).length + 1;
              
              return (
                <div key={track.id} className="flex items-center space-x-4 p-4 hover:bg-white/5 rounded-lg transition-colors">
                  <div className="text-gray-400 font-mono text-sm w-8">
                    {trackNumber.toString().padStart(2, '0')}
                  </div>
                  
                  {track.album?.images?.[0] && (
                    <img 
                      src={track.album.images[0].url} 
                      alt={track.album.name}
                      className="w-12 h-12 rounded-md object-cover"
                    />
                  )}
                  
                  <div className="flex-grow">
                    <h3 className="font-semibold text-white">{track.name}</h3>
                    <p className="text-sm text-gray-300">
                      {track.artists.map(artist => artist.name).join(', ')}
                    </p>
                    {track.reasons && track.reasons.length > 0 && (
                      <p className="text-xs text-blue-400 mt-1">
                        {track.reasons.join(', ')}
                      </p>
                    )}
                  </div>
                  
                  <div className="text-right">
                    {track.duration && (
                      <p className="text-sm text-gray-400">
                        {formatDuration(track.duration)}
                      </p>
                    )}
                    {track.score && (
                      <p className="text-xs text-green-400">
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
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-400">No recommendations available</p>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

export default DashboardPage;