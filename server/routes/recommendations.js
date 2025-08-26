const express = require('express');
const router = express.Router();
const playlistGenerator = require('../services/playlistGenerator');
const recommendationEngine = require('../services/recommendationEngine');
const contextService = require('../services/contextService');
const RecommendationLog = require('../models/RecommendationLog');
const logger = require('../utils/logger');
const { authenticate, requireSpotifyAuth } = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');

/**
 * @route   POST /api/recommendations/create
 * @desc    Generate and create a playlist with recommendations
 * @access  Private (requires Spotify auth)
 */
router.post('/create', 
  rateLimiter.recommendation,
  authenticate, 
  requireSpotifyAuth, 
  async (req, res) => {
    try {
      const userId = req.user._id;
      const {
        context,
        userLocation,
        targetLength = 20,
        diversityWeight = 0.3,
        isPublic = false,
        forceCreate = false
      } = req.body;

      const options = {
        targetLength: Math.min(Math.max(targetLength, 10), 50), // Clamp between 10-50
        diversityWeight: Math.min(Math.max(diversityWeight, 0), 1), // Clamp between 0-1
        isPublic,
        forceCreate,
        userLocation,
        clientIp: req.ip,
        deviceInfo: {
          userAgent: req.get('User-Agent'),
          platform: req.get('X-Platform') || 'web'
        }
      };

      logger.info('Creating playlist for user', {
        userId,
        options: {
          targetLength: options.targetLength,
          diversityWeight: options.diversityWeight,
          hasContext: !!context,
          hasLocation: !!userLocation
        }
      });

      const result = await playlistGenerator.generateAndCreatePlaylist(
        userId,
        context,
        options
      );

      if (result.success) {
        res.status(201).json({
          success: true,
          playlist: result.playlist,
          metadata: result.metadata
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
          fallback: result.fallback
        });
      }

    } catch (error) {
      logger.error('Error creating playlist:', error);
      res.status(500).json({
        error: 'Failed to create playlist',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route   POST /api/recommendations/preview
 * @desc    Preview recommendations without creating playlist
 * @access  Private
 */
router.post('/preview',
  rateLimiter.recommendation,
  authenticate,
  requireSpotifyAuth,
  async (req, res) => {
    try {
      const userId = req.user._id;
      const {
        context,
        userLocation,
        targetLength = 20,
        diversityWeight = 0.3
      } = req.body;

      const options = {
        targetLength: Math.min(Math.max(targetLength, 10), 50),
        diversityWeight: Math.min(Math.max(diversityWeight, 0), 1),
        userLocation,
        clientIp: req.ip,
        deviceInfo: {
          userAgent: req.get('User-Agent'),
          platform: req.get('X-Platform') || 'web'
        }
      };

      const result = await playlistGenerator.previewRecommendations(
        userId,
        context,
        options
      );

      res.json(result);

    } catch (error) {
      logger.error('Error previewing recommendations:', error);
      res.status(500).json({
        error: 'Failed to preview recommendations'
      });
    }
  }
);

/**
 * @route   POST /api/recommendations/{recId}/feedback
 * @desc    Record user feedback for a recommendation
 * @access  Private
 */
router.post('/:recId/feedback',
  authenticate,
  async (req, res) => {
    try {
      const { recId } = req.params;
      const userId = req.user._id;
      const {
        action, // 'click', 'play', 'save', 'share', 'rate'
        rating,
        feedback,
        trackData
      } = req.body;

      if (!action) {
        return res.status(400).json({
          error: 'Action is required'
        });
      }

      // Find the recommendation log
      const recLog = await RecommendationLog.findOne({
        recId,
        userId
      });

      if (!recLog) {
        return res.status(404).json({
          error: 'Recommendation not found'
        });
      }

      // Update based on action
      let updated = false;
      
      switch (action) {
        case 'click':
          await recLog.recordClick();
          updated = true;
          break;
          
        case 'open':
          await recLog.recordOpen();
          updated = true;
          break;
          
        case 'play':
          await recLog.recordPlay();
          updated = true;
          break;
          
        case 'save':
          await recLog.recordSave();
          updated = true;
          break;
          
        case 'rate':
          if (rating >= 1 && rating <= 5) {
            await recLog.recordRating(rating, feedback);
            updated = true;
          }
          break;
          
        case 'session_update':
          if (trackData) {
            await recLog.updatePlayStats(
              trackData.tracksPlayed || 0,
              trackData.tracksSkipped || 0,
              trackData.sessionDuration || 0
            );
            updated = true;
          }
          break;
      }

      if (updated) {
        // Recalculate engagement score
        await recLog.calculateEngagementScore();
        
        logger.info('Recommendation feedback recorded', {
          recId,
          userId,
          action,
          rating
        });

        res.json({
          success: true,
          message: 'Feedback recorded successfully'
        });
      } else {
        res.status(400).json({
          error: 'Invalid action or missing required data'
        });
      }

    } catch (error) {
      logger.error('Error recording recommendation feedback:', error);
      res.status(500).json({
        error: 'Failed to record feedback'
      });
    }
  }
);

/**
 * @route   GET /api/recommendations/history
 * @desc    Get user's recommendation history
 * @access  Private
 */
router.get('/history',
  authenticate,
  async (req, res) => {
    try {
      const userId = req.user._id;
      const { limit = 20, offset = 0 } = req.query;

      const history = await RecommendationLog.getUserEngagementHistory(
        userId,
        parseInt(limit)
      );

      // Get total count for pagination
      const totalCount = await RecommendationLog.countDocuments({ userId });

      res.json({
        success: true,
        history: history.map(rec => ({
          recId: rec.recId || rec._id,
          deliveredAt: rec.deliveredAt,
          playlistName: rec.output?.playlistName,
          context: rec.input?.context,
          engagement: {
            clicked: rec.userInteraction?.clicked || false,
            played: rec.userInteraction?.played || false,
            saved: rec.userInteraction?.saved || false,
            rating: rec.userInteraction?.rating
          },
          performance: rec.performance
        })),
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: totalCount,
          hasMore: (parseInt(offset) + parseInt(limit)) < totalCount
        }
      });

    } catch (error) {
      logger.error('Error getting recommendation history:', error);
      res.status(500).json({
        error: 'Failed to get recommendation history'
      });
    }
  }
);

/**
 * @route   GET /api/recommendations/analytics
 * @desc    Get recommendation analytics for user
 * @access  Private
 */
router.get('/analytics',
  authenticate,
  async (req, res) => {
    try {
      const userId = req.user._id;
      const { days = 30 } = req.query;
      
      const startDate = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);
      const endDate = new Date();

      // Get performance metrics
      const [performance, contextPatterns] = await Promise.all([
        RecommendationLog.getPerformanceMetrics(startDate, endDate, { userId }),
        RecommendationLog.aggregate([
          {
            $match: {
              userId: userId,
              deliveredAt: { $gte: startDate, $lte: endDate }
            }
          },
          {
            $group: {
              _id: {
                timeOfDay: '$input.context.timeOfDay',
                weather: '$input.context.weather'
              },
              count: { $sum: 1 },
              avgEngagement: { $avg: '$performance.engagementScore' },
              playRate: {
                $avg: { $cond: ['$userInteraction.played', 1, 0] }
              }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ])
      ]);

      res.json({
        success: true,
        analytics: {
          period: { days: parseInt(days), startDate, endDate },
          performance: performance[0] || {
            totalRecommendations: 0,
            ctr: 0,
            ptr: 0,
            str: 0,
            avgRating: 0,
            avgEngagementScore: 0
          },
          contextPatterns: contextPatterns.map(pattern => ({
            context: pattern._id,
            count: pattern.count,
            avgEngagement: pattern.avgEngagement || 0,
            playRate: pattern.playRate || 0
          })),
          insights: {
            mostActiveContext: contextPatterns[0]?._id,
            bestPerformingContext: contextPatterns.sort((a, b) => b.avgEngagement - a.avgEngagement)[0]?._id
          }
        }
      });

    } catch (error) {
      logger.error('Error getting recommendation analytics:', error);
      res.status(500).json({
        error: 'Failed to get analytics'
      });
    }
  }
);

/**
 * @route   GET /api/recommendations/popular-contexts
 * @desc    Get popular recommendation contexts
 * @access  Public (aggregated data)
 */
router.get('/popular-contexts', async (req, res) => {
  try {
    const { days = 7, limit = 20 } = req.query;

    const popularContexts = await RecommendationLog.getPopularContexts(
      parseInt(days),
      parseInt(limit)
    );

    res.json({
      success: true,
      contexts: popularContexts.map(ctx => ({
        context: ctx._id,
        count: ctx.count,
        avgEngagement: ctx.avgEngagement || 0,
        avgRating: ctx.avgRating || 0
      })),
      metadata: {
        period: `${days} days`,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error getting popular contexts:', error);
    res.status(500).json({
      error: 'Failed to get popular contexts'
    });
  }
});

module.exports = router;