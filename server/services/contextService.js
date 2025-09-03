const axios = require('axios');
const NodeCache = require('node-cache');
const logger = require('../utils/logger');
const ContextLog = require('../models/ContextLog');
const { v4: uuidv4 } = require('uuid');

class ContextService {
  constructor() {
    // Cache for 5 minutes (300 seconds) for weather data
    this.cache = new NodeCache({ stdTTL: 300 });
    this.weatherApiKey = process.env.WEATHER_API_KEY;
    this.geoApiKey = process.env.GEOIP_API_KEY;
  }

  /**
   * Get current context for a user
   */
  async getCurrentContext(userId, userLocation = null, deviceInfo = {}) {
    try {
      const context = {
        timestamp: new Date(),
        userId,
        contextId: uuidv4()
      };

      // Get time context
      const timeContext = this.getTimeContext();
      Object.assign(context, timeContext);

      // Get location context
      let locationContext;
      if (userLocation) {
        locationContext = userLocation;
      } else {
        locationContext = await this.getLocationContext(deviceInfo.ip);
      }
      context.geoLocation = locationContext;

      // Get weather context
      const weatherContext = await this.getWeatherContext(locationContext);
      context.weather = weatherContext;

      // Get season
      context.season = this.getSeason(locationContext.coordinates?.lat);

      // Add device info
      context.deviceInfo = deviceInfo;

      // Cache the context
      this.cache.set(`context_${userId}`, context);

      // Log context for analytics (async, don't wait) - only if database is available
      if (process.env.NODE_ENV === 'production') {
        this.logContext(context).catch(err => {
          logger.warn('Failed to log context (database may be unavailable):', err.message);
        });
      }

      return context;
    } catch (error) {
      logger.error('Error getting current context:', error);
      
      // Return minimal context on error
      return {
        timestamp: new Date(),
        userId,
        contextId: uuidv4(),
        ...this.getTimeContext(),
        geoLocation: { city: 'Unknown', country: 'Unknown' },
        weather: { condition: 'unknown', temperature: 20 },
        season: 'spring'
      };
    }
  }

  /**
   * Get cached context for a user
   */
  getCachedContext(userId) {
    return this.cache.get(`context_${userId}`);
  }

  /**
   * Get time-based context
   */
  getTimeContext(timezone = null) {
    const now = new Date();
    const hour = timezone ? 
      new Date(now.toLocaleString('en-US', { timeZone: timezone })).getHours() :
      now.getHours();

    let timeOfDay;
    if (hour >= 6 && hour < 12) {
      timeOfDay = 'morning';
    } else if (hour >= 12 && hour < 17) {
      timeOfDay = 'afternoon';
    } else if (hour >= 17 && hour < 21) {
      timeOfDay = 'evening';
    } else {
      timeOfDay = 'night';
    }

    return {
      timeOfDay,
      hour,
      timestamp: now
    };
  }

  /**
   * Get location context from IP or coordinates
   */
  async getLocationContext(ip = null, coordinates = null) {
    try {
      // Try cache first
      const cacheKey = ip ? `location_${ip}` : `location_${coordinates?.lat}_${coordinates?.lng}`;
      const cached = this.cache.get(cacheKey);
      if (cached) {
        logger.debug('Using cached location data', { cacheKey, city: cached.city });
        return cached;
      }

      let locationData;

      if (coordinates) {
        logger.debug('Getting location from coordinates', coordinates);
        // Reverse geocoding
        const response = await axios.get(
          `https://api.openweathermap.org/geo/1.0/reverse`,
          {
            params: {
              lat: coordinates.lat,
              lon: coordinates.lng,
              limit: 1,
              appid: this.weatherApiKey
            },
            timeout: 5000
          }
        );

        if (response.data && response.data.length > 0) {
          const data = response.data[0];
          locationData = {
            city: data.name,
            country: data.country,
            region: data.state,
            coordinates: {
              lat: data.lat,
              lng: data.lon
            }
          };
          logger.debug('Location from coordinates', locationData);
        }
      } else if (this.geoApiKey) {
        logger.debug('Getting location from IP', { ip, hasApiKey: !!this.geoApiKey });
        
        // IP geolocation - let API auto-detect IP if not provided
        const params = {
          apiKey: this.geoApiKey
        };
        
        // Only add IP parameter if we have a valid IP and it's not localhost/internal
        if (ip && !this.isLocalIP(ip)) {
          params.ip = ip;
        }
        
        const response = await axios.get(
          `https://api.ipgeolocation.io/ipgeo`,
          {
            params,
            timeout: 10000
          }
        );

        logger.debug('GeoIP API response', { 
          status: response.status, 
          city: response.data?.city,
          country: response.data?.country_name,
          ip: response.data?.ip
        });

        if (response.data && response.data.city && response.data.city !== '-') {
          const data = response.data;
          locationData = {
            city: data.city,
            country: data.country_name,
            region: data.state_prov,
            timezone: data.time_zone?.name,
            coordinates: {
              lat: parseFloat(data.latitude),
              lng: parseFloat(data.longitude)
            }
          };
          logger.debug('Location from IP geolocation', locationData);
        }
      } else {
        logger.warn('No GeoIP API key configured, cannot get location from IP');
      }

      // Fallback to default location
      if (!locationData) {
        logger.warn('No location data obtained, using fallback');
        locationData = {
          city: 'Unknown',
          country: 'Unknown',
          coordinates: { lat: 0, lng: 0 }
        };
      }

      // Cache for 1 hour
      this.cache.set(cacheKey, locationData, 3600);
      return locationData;

    } catch (error) {
      logger.error('Error getting location context:', error);
      if (error.response) {
        logger.error('GeoIP API error response:', {
          status: error.response.status,
          data: error.response.data
        });
      }
      return {
        city: 'Unknown',
        country: 'Unknown',
        coordinates: { lat: 0, lng: 0 }
      };
    }
  }

  /**
   * Check if IP address is local/private
   */
  isLocalIP(ip) {
    if (!ip || ip === '::1' || ip === '127.0.0.1') return true;
    
    // Check for private IP ranges
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^::ffff:192\.168\./,
      /^::ffff:10\./,
      /^::ffff:172\./
    ];
    
    return privateRanges.some(range => range.test(ip));
  }

  /**
   * Get weather context for a location
   */
  async getWeatherContext(location) {
    try {
      if (!location?.coordinates || !this.weatherApiKey) {
        return {
          condition: 'unknown',
          temperature: 20,
          humidity: 50
        };
      }

      const { lat, lng } = location.coordinates;
      const cacheKey = `weather_${lat}_${lng}`;
      
      // Check cache first
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const response = await axios.get(
        'https://api.openweathermap.org/data/2.5/weather',
        {
          params: {
            lat,
            lon: lng,
            appid: this.weatherApiKey,
            units: 'metric'
          },
          timeout: 5000
        }
      );

      if (response.data) {
        const data = response.data;
        const weatherData = {
          condition: this.mapWeatherCondition(data.weather[0].main, data.weather[0].description),
          temperature: Math.round(data.main.temp),
          feelsLike: Math.round(data.main.feels_like),
          humidity: data.main.humidity,
          windSpeed: data.wind?.speed || 0,
          pressure: data.main.pressure,
          visibility: data.visibility ? data.visibility / 1000 : null, // Convert to km
          cloudCover: data.clouds?.all || 0,
          description: data.weather[0].description
        };

        // Cache for 10 minutes
        this.cache.set(cacheKey, weatherData, 600);
        return weatherData;
      }

      throw new Error('No weather data received');

    } catch (error) {
      logger.error('Error getting weather context:', error);
      return {
        condition: 'unknown',
        temperature: 20,
        humidity: 50
      };
    }
  }

  /**
   * Map OpenWeatherMap conditions to our simplified conditions
   */
  mapWeatherCondition(main, description) {
    const mainLower = main.toLowerCase();
    const descLower = description.toLowerCase();

    if (mainLower === 'clear') {
      return 'sunny';
    } else if (mainLower === 'clouds') {
      if (descLower.includes('few') || descLower.includes('scattered')) {
        return 'partly_cloudy';
      }
      return 'cloudy';
    } else if (mainLower === 'rain' || mainLower === 'drizzle') {
      return 'rainy';
    } else if (mainLower === 'thunderstorm') {
      return 'stormy';
    } else if (mainLower === 'snow') {
      return 'snow';
    } else if (mainLower === 'mist' || mainLower === 'fog' || mainLower === 'haze') {
      return 'fog';
    }

    return 'cloudy'; // Default fallback
  }

  /**
   * Get season based on latitude and current date
   */
  getSeason(latitude = 0) {
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    
    // Check if location is in tropical zone (between 23.5°N and 23.5°S)
    if (Math.abs(latitude) < 23.5) {
      // Tropical regions: wet and dry seasons instead of traditional seasons
      if (month >= 5 && month <= 10) {
        return 'wet'; // Wet/rainy season (May-October in most tropical regions)
      } else {
        return 'dry'; // Dry season (November-April)
      }
    }
    
    // Traditional seasons for temperate zones
    let season;
    if (month >= 3 && month <= 5) {
      season = 'spring';
    } else if (month >= 6 && month <= 8) {
      season = 'summer';
    } else if (month >= 9 && month <= 11) {
      season = 'autumn';
    } else {
      season = 'winter';
    }

    // Reverse seasons for southern hemisphere (outside tropical zone)
    if (latitude < -23.5) {
      const seasonMap = {
        'spring': 'autumn',
        'summer': 'winter',
        'autumn': 'spring',
        'winter': 'summer'
      };
      season = seasonMap[season] || season;
    }

    return season;
  }

  /**
   * Log context to database for analytics
   */
  async logContext(context) {
    try {
      const contextLog = new ContextLog({
        contextId: context.contextId,
        userId: context.userId,
        timestamp: context.timestamp,
        timeOfDay: context.timeOfDay,
        geoLocation: context.geoLocation,
        weather: context.weather,
        season: context.season,
        deviceInfo: context.deviceInfo
      });

      await contextLog.save();
      logger.debug('Context logged successfully', { contextId: context.contextId });
    } catch (error) {
      logger.error('Error logging context:', error);
    }
  }

  /**
   * Get similar contexts for a user
   */
  async getSimilarContexts(userId, currentContext, limit = 10) {
    try {
      const contextLog = new ContextLog(currentContext);
      const similarContexts = await contextLog.getSimilarContexts();
      return similarContexts.limit(limit);
    } catch (error) {
      logger.error('Error getting similar contexts:', error);
      return [];
    }
  }

  /**
   * Get user's context patterns
   */
  async getUserContextPatterns(userId, days = 30) {
    try {
      return await ContextLog.getContextPatterns(userId, days);
    } catch (error) {
      logger.error('Error getting user context patterns:', error);
      return [];
    }
  }

  /**
   * Detect activity based on context (basic implementation)
   */
  detectActivity(context, userHistory = []) {
    const { timeOfDay, weather, geoLocation } = context;
    
    // Basic activity detection rules
    if (timeOfDay === 'morning' && weather.condition === 'sunny') {
      return {
        detectedActivity: 'commuting',
        confidence: 0.7,
        duration: null
      };
    }

    if (timeOfDay === 'night') {
      return {
        detectedActivity: 'relaxing',
        confidence: 0.8,
        duration: null
      };
    }

    if (weather.condition === 'rainy') {
      return {
        detectedActivity: 'indoor',
        confidence: 0.6,
        duration: null
      };
    }

    return {
      detectedActivity: 'general',
      confidence: 0.5,
      duration: null
    };
  }

  /**
   * Basic mood detection based on context
   */
  detectMood(context) {
    const { timeOfDay, weather } = context;
    
    // Simple mood mapping based on time and weather
    if (weather.condition === 'sunny' && ['morning', 'afternoon'].includes(timeOfDay)) {
      return {
        primary: 'energetic',
        confidence: 0.7,
        source: 'context'
      };
    }

    if (weather.condition === 'rainy') {
      return {
        primary: 'calm',
        confidence: 0.6,
        source: 'context'
      };
    }

    if (timeOfDay === 'evening') {
      return {
        primary: 'relaxed',
        confidence: 0.5,
        source: 'context'
      };
    }

    return {
      primary: 'neutral',
      confidence: 0.3,
      source: 'context'
    };
  }
}

module.exports = new ContextService();