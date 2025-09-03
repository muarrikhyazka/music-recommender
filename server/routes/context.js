const express = require('express');
const router = express.Router();
const contextService = require('../services/contextService');
const ContextLog = require('../models/ContextLog');
const logger = require('../utils/logger');
const { authenticate, optionalAuth } = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');

/**
 * @route   GET /api/context/current
 * @desc    Get current context data for user
 * @access  Private/Public (optional auth)
 */
router.get('/current',
  rateLimiter.context,
  optionalAuth,
  async (req, res) => {
    try {
      const userId = req.userId || null;
      const {
        lat,
        lng,
        city,
        country,
        skipWeather = false
      } = req.query;

      let userLocation = null;
      if (lat && lng) {
        userLocation = {
          coordinates: {
            lat: parseFloat(lat),
            lng: parseFloat(lng)
          }
        };
      } else if (city && country) {
        userLocation = { city, country };
      }

      // Get the real IP address, considering proxy headers
      const getRealIP = (req) => {
        return req.get('cf-connecting-ip') ||    // Cloudflare
               req.get('x-real-ip') ||           // Nginx proxy
               req.get('x-forwarded-for')?.split(',')[0] || // Load balancer
               req.connection?.remoteAddress ||   // Direct connection
               req.ip ||                         // Express default
               null;
      };

      const deviceInfo = {
        ip: getRealIP(req),
        userAgent: req.get('User-Agent'),
        platform: req.get('X-Platform') || 'web'
      };

      const context = await contextService.getCurrentContext(
        userId || 'anonymous',
        userLocation,
        deviceInfo
      );

      // Remove sensitive data for non-authenticated requests
      if (!userId) {
        delete context.geoLocation?.coordinates;
      }

      res.json({
        success: true,
        context: {
          timeOfDay: context.timeOfDay,
          weather: skipWeather === 'true' ? null : context.weather,
          location: {
            city: context.geoLocation?.city,
            country: context.geoLocation?.country,
            timezone: context.geoLocation?.timezone
          },
          season: context.season,
          timestamp: context.timestamp
        },
        metadata: {
          cached: false, // TODO: implement cache detection
          contextId: context.contextId
        }
      });

    } catch (error) {
      logger.error('Error getting current context:', error);
      res.status(500).json({
        error: 'Failed to get current context'
      });
    }
  }
);

/**
 * @route   POST /api/context/detect
 * @desc    Detect context with enhanced data
 * @access  Private
 */
router.post('/detect',
  rateLimiter.context,
  authenticate,
  async (req, res) => {
    try {
      const userId = req.user._id;
      const {
        location,
        activity,
        mood,
        social,
        preferences = {}
      } = req.body;

      const deviceInfo = {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        platform: req.get('X-Platform') || 'web',
        ...req.body.deviceInfo
      };

      // Get basic context
      const context = await contextService.getCurrentContext(
        userId,
        location,
        deviceInfo
      );

      // Enhance with provided data
      if (activity) {
        context.activityContext = {
          detectedActivity: activity.type,
          confidence: activity.confidence || 0.8,
          duration: activity.duration
        };
      }

      if (mood) {
        context.moodDetected = {
          primary: mood.primary,
          secondary: mood.secondary,
          confidence: mood.confidence || 0.7,
          source: mood.source || 'manual'
        };
      }

      if (social) {
        context.socialContext = {
          alone: social.alone !== false,
          groupSize: social.groupSize || 1,
          occasion: social.occasion
        };
      }

      res.json({
        success: true,
        context: {
          contextId: context.contextId,
          timeOfDay: context.timeOfDay,
          weather: context.weather,
          location: context.geoLocation,
          season: context.season,
          activity: context.activityContext,
          mood: context.moodDetected,
          social: context.socialContext,
          timestamp: context.timestamp
        }
      });

    } catch (error) {
      logger.error('Error detecting enhanced context:', error);
      res.status(500).json({
        error: 'Failed to detect context'
      });
    }
  }
);

/**
 * @route   GET /api/context/patterns
 * @desc    Get user's context patterns
 * @access  Private
 */
router.get('/patterns',
  authenticate,
  async (req, res) => {
    try {
      const userId = req.user._id;
      const { days = 30, type = 'all' } = req.query;

      let patterns;
      
      switch (type) {
        case 'weather':
          patterns = await ContextLog.getWeatherPreferences(userId, parseInt(days));
          break;
        case 'mood':
          patterns = await ContextLog.getMoodPatterns(userId, parseInt(days));
          break;
        case 'all':
        default:
          patterns = await ContextLog.getContextPatterns(userId, parseInt(days));
          break;
      }

      res.json({
        success: true,
        patterns: patterns.map(pattern => ({
          context: pattern._id,
          frequency: pattern.count,
          lastSeen: pattern.lastSeen,
          metadata: {
            avgTemp: pattern.avgTemp,
            moods: pattern.moods,
            preferredTimes: pattern.preferredTimes,
            avgConfidence: pattern.avgConfidence
          }
        })),
        metadata: {
          type,
          period: `${days} days`,
          totalPatterns: patterns.length
        }
      });

    } catch (error) {
      logger.error('Error getting context patterns:', error);
      res.status(500).json({
        error: 'Failed to get context patterns'
      });
    }
  }
);

/**
 * @route   GET /api/context/similar
 * @desc    Find similar contexts to current one
 * @access  Private
 */
router.get('/similar',
  authenticate,
  async (req, res) => {
    try {
      const userId = req.user._id;
      const { contextId, limit = 10 } = req.query;

      if (!contextId) {
        return res.status(400).json({
          error: 'Context ID is required'
        });
      }

      // Find the reference context
      const referenceContext = await ContextLog.findOne({
        contextId,
        userId
      });

      if (!referenceContext) {
        return res.status(404).json({
          error: 'Context not found'
        });
      }

      // Find similar contexts
      const similarContexts = await referenceContext.getSimilarContexts(0.8);
      const limitedResults = similarContexts.slice(0, parseInt(limit));

      res.json({
        success: true,
        referenceContext: {
          contextId: referenceContext.contextId,
          timeOfDay: referenceContext.timeOfDay,
          weather: referenceContext.weather?.condition,
          location: referenceContext.geoLocation?.city,
          timestamp: referenceContext.timestamp
        },
        similarContexts: limitedResults.map(ctx => ({
          contextId: ctx.contextId,
          timeOfDay: ctx.timeOfDay,
          weather: ctx.weather?.condition,
          location: ctx.geoLocation?.city,
          timestamp: ctx.timestamp,
          similarity: 0.8 // TODO: Calculate actual similarity score
        })),
        metadata: {
          totalFound: similarContexts.length,
          returned: limitedResults.length
        }
      });

    } catch (error) {
      logger.error('Error finding similar contexts:', error);
      res.status(500).json({
        error: 'Failed to find similar contexts'
      });
    }
  }
);

/**
 * @route   GET /api/context/weather
 * @desc    Get weather information for location
 * @access  Public
 */
router.get('/weather', async (req, res) => {
  try {
    const { lat, lng, city, country } = req.query;

    let location;
    if (lat && lng) {
      location = {
        coordinates: {
          lat: parseFloat(lat),
          lng: parseFloat(lng)
        }
      };
    } else if (city && country) {
      location = { city, country };
    } else {
      return res.status(400).json({
        error: 'Location coordinates (lat, lng) or city and country required'
      });
    }

    const weather = await contextService.getWeatherContext(location);

    res.json({
      success: true,
      weather: {
        condition: weather.condition,
        temperature: weather.temperature,
        feelsLike: weather.feelsLike,
        humidity: weather.humidity,
        windSpeed: weather.windSpeed,
        description: weather.description
      },
      location: {
        city: location.city,
        country: location.country,
        coordinates: location.coordinates
      }
    });

  } catch (error) {
    logger.error('Error getting weather:', error);
    res.status(500).json({
      error: 'Failed to get weather information'
    });
  }
});

/**
 * @route   POST /api/context/mood
 * @desc    Submit mood information
 * @access  Private
 */
router.post('/mood',
  authenticate,
  async (req, res) => {
    try {
      const userId = req.user._id;
      const { mood, confidence = 0.9, context } = req.body;

      if (!mood) {
        return res.status(400).json({
          error: 'Mood is required'
        });
      }

      const allowedMoods = [
        'happy', 'sad', 'energetic', 'calm', 'stressed', 
        'relaxed', 'focused', 'social', 'romantic', 'nostalgic'
      ];

      if (!allowedMoods.includes(mood)) {
        return res.status(400).json({
          error: 'Invalid mood. Allowed values: ' + allowedMoods.join(', ')
        });
      }

      // Get current context if not provided
      const currentContext = context || await contextService.getCurrentContext(
        userId,
        null,
        { ip: req.ip, userAgent: req.get('User-Agent') }
      );

      // Update context with mood
      currentContext.moodDetected = {
        primary: mood,
        confidence: Math.min(Math.max(confidence, 0), 1),
        source: 'manual',
        reportedAt: new Date()
      };

      // Log the updated context
      await contextService.logContext(currentContext);

      logger.info('Mood reported', {
        userId,
        mood,
        confidence,
        contextId: currentContext.contextId
      });

      res.json({
        success: true,
        message: 'Mood recorded successfully',
        context: {
          contextId: currentContext.contextId,
          mood: currentContext.moodDetected,
          timeOfDay: currentContext.timeOfDay
        }
      });

    } catch (error) {
      logger.error('Error recording mood:', error);
      res.status(500).json({
        error: 'Failed to record mood'
      });
    }
  }
);

/**
 * @route   GET /api/context/health
 * @desc    Health check for context services
 * @access  Public
 */
router.get('/health', async (req, res) => {
  try {
    const checks = {
      timeService: true,
      weatherService: false,
      geoService: false,
      database: false
    };

    // Test weather service
    try {
      await contextService.getWeatherContext({
        coordinates: { lat: 0, lng: 0 }
      });
      checks.weatherService = true;
    } catch (error) {
      logger.warn('Weather service check failed:', error.message);
    }

    // Test geo service
    try {
      await contextService.getLocationContext('8.8.8.8');
      checks.geoService = true;
    } catch (error) {
      logger.warn('Geo service check failed:', error.message);
    }

    // Test database
    try {
      await ContextLog.findOne({}).limit(1);
      checks.database = true;
    } catch (error) {
      logger.warn('Database check failed:', error.message);
    }

    const allHealthy = Object.values(checks).every(check => check);

    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error in context health check:', error);
    res.status(503).json({
      status: 'error',
      error: 'Health check failed'
    });
  }
});

module.exports = router;