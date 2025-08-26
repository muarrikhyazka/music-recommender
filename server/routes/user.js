const express = require('express');
const router = express.Router();
const playlistGenerator = require('../services/playlistGenerator');
const spotifyService = require('../services/spotifyService');
const ListeningHistory = require('../models/ListeningHistory');
const Playlist = require('../models/Playlist');
const logger = require('../utils/logger');
const { authenticate, requireSpotifyAuth } = require('../middleware/auth');

/**
 * @route   GET /api/user/profile
 * @desc    Get detailed user profile with Spotify data
 * @access  Private
 */
router.get('/profile',
  authenticate,
  requireSpotifyAuth,
  async (req, res) => {
    try {
      const user = req.user;
      const accessToken = await spotifyService.ensureValidToken(user);

      // Get Spotify profile data
      const [topTracks, topArtists, recentTracks, playlists] = await Promise.all([
        spotifyService.getUserTopTracks(accessToken, 'medium_term', 20).catch(() => []),
        spotifyService.getUserTopArtists(accessToken, 'medium_term', 20).catch(() => []),
        spotifyService.getRecentlyPlayed(accessToken, 20).catch(() => []),
        spotifyService.getUserPlaylists(accessToken, 20).catch(() => [])
      ]);

      // Get listening patterns from our database
      const [listeningHistory, contextPatterns] = await Promise.all([
        ListeningHistory.getUserRecentTracks(user._id, 20).catch(() => []),
        ListeningHistory.getListeningPatterns(user._id, 30).catch(() => [])
      ]);

      // Extract genre preferences
      const genreFreq = new Map();
      topArtists.forEach(artist => {
        artist.genres.forEach(genre => {
          genreFreq.set(genre, (genreFreq.get(genre) || 0) + 1);
        });
      });

      const topGenres = Array.from(genreFreq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([genre, count]) => ({ name: genre, count }));

      res.json({
        success: true,
        profile: {
          basic: {
            id: user._id,
            displayName: user.displayName,
            email: user.email,
            spotifyId: user.spotifyId,
            country: user.spotifyProfile?.country,
            followers: user.spotifyProfile?.followers,
            images: user.spotifyProfile?.images || [],
            product: user.spotifyProfile?.product,
            joinedAt: user.createdAt
          },
          preferences: user.preferences,
          spotify: {
            topTracks: topTracks.slice(0, 10),
            topArtists: topArtists.slice(0, 10),
            topGenres,
            recentTracks: recentTracks.slice(0, 10).map(item => item.track),
            playlistCount: playlists.length
          },
          listening: {
            history: listeningHistory.slice(0, 10),
            patterns: contextPatterns.slice(0, 5),
            totalSessions: listeningHistory.length
          }
        }
      });

    } catch (error) {
      logger.error('Error getting user profile:', error);
      res.status(500).json({
        error: 'Failed to get user profile'
      });
    }
  }
);

/**
 * @route   GET /api/user/playlists
 * @desc    Get user's generated playlists
 * @access  Private
 */
router.get('/playlists',
  authenticate,
  async (req, res) => {
    try {
      const userId = req.user._id;
      const { limit = 20, offset = 0, type = 'generated' } = req.query;

      const result = await playlistGenerator.getUserPlaylistHistory(
        userId,
        parseInt(limit),
        parseInt(offset)
      );

      res.json(result);

    } catch (error) {
      logger.error('Error getting user playlists:', error);
      res.status(500).json({
        error: 'Failed to get playlists'
      });
    }
  }
);

/**
 * @route   GET /api/user/listening-stats
 * @desc    Get user's listening statistics
 * @access  Private
 */
router.get('/listening-stats',
  authenticate,
  async (req, res) => {
    try {
      const userId = req.user._id;
      const { days = 30 } = req.query;

      const [topTracks, patterns, skipPatterns, totalSessions] = await Promise.all([
        ListeningHistory.getUserTopTracks(userId, parseInt(days), 20),
        ListeningHistory.getListeningPatterns(userId, parseInt(days)),
        ListeningHistory.getSkipPatterns(userId, parseInt(days)),
        ListeningHistory.countDocuments({
          userId,
          playedAt: {
            $gte: new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000)
          }
        })
      ]);

      // Calculate listening time
      const totalListeningTime = await ListeningHistory.aggregate([
        {
          $match: {
            userId: userId,
            playedAt: {
              $gte: new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000)
            }
          }
        },
        {
          $group: {
            _id: null,
            totalDuration: { $sum: '$interaction.duration' },
            completedSongs: {
              $sum: { $cond: ['$interaction.completed', 1, 0] }
            },
            skippedSongs: {
              $sum: { $cond: ['$interaction.skipped', 1, 0] }
            }
          }
        }
      ]);

      const stats = totalListeningTime[0] || {
        totalDuration: 0,
        completedSongs: 0,
        skippedSongs: 0
      };

      res.json({
        success: true,
        stats: {
          period: `${days} days`,
          totalSessions,
          totalListeningTime: Math.round(stats.totalDuration / 1000 / 60), // minutes
          completedSongs: stats.completedSongs,
          skippedSongs: stats.skippedSongs,
          completionRate: stats.completedSongs / (stats.completedSongs + stats.skippedSongs) || 0,
          topTracks: topTracks.map(track => ({
            song: track.song,
            playCount: track.playCount,
            totalDuration: Math.round(track.totalDuration / 1000 / 60),
            lastPlayed: track.lastPlayed
          })),
          listeningPatterns: patterns,
          skipPatterns: skipPatterns
        }
      });

    } catch (error) {
      logger.error('Error getting listening stats:', error);
      res.status(500).json({
        error: 'Failed to get listening statistics'
      });
    }
  }
);

/**
 * @route   POST /api/user/listening-history
 * @desc    Record listening history event
 * @access  Private
 */
router.post('/listening-history',
  authenticate,
  async (req, res) => {
    try {
      const userId = req.user._id;
      const {
        spotifyTrackId,
        playlistId,
        duration = 0,
        completed = false,
        skipped = false,
        skipReason,
        context,
        sessionId
      } = req.body;

      if (!spotifyTrackId) {
        return res.status(400).json({
          error: 'Spotify track ID is required'
        });
      }

      // Create listening history entry
      const historyEntry = new ListeningHistory({
        historyId: `${userId}_${spotifyTrackId}_${Date.now()}`,
        userId,
        spotifyTrackId,
        playlistId,
        playedAt: new Date(),
        context: context || {},
        interaction: {
          duration,
          completed,
          skipped,
          skipReason
        },
        sessionId
      });

      await historyEntry.save();

      logger.info('Listening history recorded', {
        userId,
        spotifyTrackId,
        duration,
        completed,
        skipped
      });

      res.json({
        success: true,
        message: 'Listening history recorded'
      });

    } catch (error) {
      logger.error('Error recording listening history:', error);
      res.status(500).json({
        error: 'Failed to record listening history'
      });
    }
  }
);

/**
 * @route   GET /api/user/recommendations-feed
 * @desc    Get personalized recommendations feed
 * @access  Private
 */
router.get('/recommendations-feed',
  authenticate,
  requireSpotifyAuth,
  async (req, res) => {
    try {
      const userId = req.user._id;
      const { limit = 5 } = req.query;

      // Get recent playlists for the feed
      const recentPlaylists = await Playlist.find({
        createdBy: userId,
        isActive: true
      })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('tracks.songId', 'title artist')
      .lean();

      // Format for feed
      const feed = recentPlaylists.map(playlist => ({
        id: playlist._id,
        type: 'playlist',
        title: playlist.name,
        description: playlist.description,
        context: playlist.context,
        createdAt: playlist.createdAt,
        trackCount: playlist.trackCount,
        spotifyUrl: playlist.spotifyUrl,
        stats: playlist.stats,
        preview: playlist.tracks.slice(0, 3).map(track => ({
          title: track.songId?.title,
          artist: track.songId?.artist
        }))
      }));

      // TODO: Add other feed items like:
      // - "Discover new artists similar to your favorites"
      // - "Perfect for current weather" suggestions
      // - "Popular in your area" recommendations

      res.json({
        success: true,
        feed,
        metadata: {
          generated: new Date().toISOString(),
          totalItems: feed.length,
          hasMore: false
        }
      });

    } catch (error) {
      logger.error('Error getting recommendations feed:', error);
      res.status(500).json({
        error: 'Failed to get recommendations feed'
      });
    }
  }
);

/**
 * @route   DELETE /api/user/playlist/:playlistId
 * @desc    Delete a user's generated playlist
 * @access  Private
 */
router.delete('/playlist/:playlistId',
  authenticate,
  async (req, res) => {
    try {
      const userId = req.user._id;
      const { playlistId } = req.params;

      const playlist = await Playlist.findOne({
        _id: playlistId,
        createdBy: userId
      });

      if (!playlist) {
        return res.status(404).json({
          error: 'Playlist not found'
        });
      }

      // Soft delete - mark as inactive
      playlist.isActive = false;
      await playlist.save();

      logger.info('Playlist deleted', {
        userId,
        playlistId,
        spotifyPlaylistId: playlist.spotifyPlaylistId
      });

      res.json({
        success: true,
        message: 'Playlist deleted successfully'
      });

    } catch (error) {
      logger.error('Error deleting playlist:', error);
      res.status(500).json({
        error: 'Failed to delete playlist'
      });
    }
  }
);

/**
 * @route   POST /api/user/export-data
 * @desc    Export user's data (GDPR compliance)
 * @access  Private
 */
router.post('/export-data',
  authenticate,
  async (req, res) => {
    try {
      const userId = req.user._id;
      const user = req.user;

      // Collect all user data
      const [playlists, listeningHistory] = await Promise.all([
        Playlist.find({ createdBy: userId }).lean(),
        ListeningHistory.find({ userId }).lean()
      ]);

      const exportData = {
        profile: {
          id: user._id,
          displayName: user.displayName,
          email: user.email,
          spotifyId: user.spotifyId,
          preferences: user.preferences,
          joinedAt: user.createdAt
        },
        playlists: playlists.map(p => ({
          id: p._id,
          name: p.name,
          createdAt: p.createdAt,
          context: p.context,
          trackCount: p.trackCount
        })),
        listeningHistory: listeningHistory.map(h => ({
          playedAt: h.playedAt,
          spotifyTrackId: h.spotifyTrackId,
          duration: h.interaction.duration,
          completed: h.interaction.completed,
          context: h.context
        })),
        exportedAt: new Date().toISOString()
      };

      logger.info('Data export requested', { userId });

      res.json({
        success: true,
        data: exportData
      });

    } catch (error) {
      logger.error('Error exporting user data:', error);
      res.status(500).json({
        error: 'Failed to export data'
      });
    }
  }
);

module.exports = router;