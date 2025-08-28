const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const spotifyService = require('../services/spotifyService');
const User = require('../models/User');
const logger = require('../utils/logger');
const { authenticate, generateToken } = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');
const { v4: uuidv4 } = require('uuid');

/**
 * @route   GET /api/auth/spotify
 * @desc    Initialize Spotify OAuth flow
 * @access  Public
 */
router.get('/spotify', rateLimiter.auth, (req, res) => {
  try {
    const state = uuidv4(); // Generate random state for security
    const authUrl = spotifyService.getAuthorizationUrl(state);
    
    // Store state in session or return to client to verify later
    res.cookie('spotify_auth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 60 * 1000 // 10 minutes
    });

    res.json({
      authUrl,
      state
    });
  } catch (error) {
    logger.error('Error initiating Spotify auth:', error);
    res.status(500).json({
      error: 'Failed to initialize Spotify authentication'
    });
  }
});

/**
 * @route   GET /api/auth/spotify/callback
 * @desc    Handle Spotify OAuth callback
 * @access  Public
 */
router.get('/callback', rateLimiter.auth, async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      logger.error('Spotify OAuth error:', error);
      return res.status(400).json({
        error: 'Spotify authentication failed',
        details: error
      });
    }

    if (!code) {
      return res.status(400).json({
        error: 'Authorization code not provided'
      });
    }

    // Verify state parameter (optional but recommended)
    const storedState = req.cookies.spotify_auth_state;
    if (state && storedState && state !== storedState) {
      return res.status(400).json({
        error: 'Invalid state parameter'
      });
    }

    // Exchange code for tokens
    const tokens = await spotifyService.exchangeCodeForTokens(code);
    
    // Get user profile from Spotify
    const spotifyProfile = await spotifyService.getUserProfile(tokens.accessToken);
    
    // Find or create user
    let user = await User.findOne({ spotifyId: spotifyProfile.spotifyId });
    
    if (user) {
      // Update existing user
      user.displayName = spotifyProfile.displayName;
      user.email = spotifyProfile.email;
      user.spotifyProfile = {
        country: spotifyProfile.country,
        followers: spotifyProfile.followers,
        images: spotifyProfile.images,
        product: spotifyProfile.product
      };
      user.tokens = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt
      };
      user.isActive = true;
    } else {
      // Create new user
      user = new User({
        userId: uuidv4(),
        email: spotifyProfile.email,
        spotifyId: spotifyProfile.spotifyId,
        displayName: spotifyProfile.displayName,
        spotifyProfile: {
          country: spotifyProfile.country,
          followers: spotifyProfile.followers,
          images: spotifyProfile.images,
          product: spotifyProfile.product
        },
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt
        },
        preferences: {
          autoCreatePlaylists: true,
          enableLocationTracking: true,
          language: 'en'
        }
      });
    }

    await user.save();

    // Generate JWT token
    const jwtToken = generateToken(user._id);

    // Clear state cookie
    res.clearCookie('spotify_auth_state');

    logger.info('User authenticated successfully', {
      userId: user._id,
      spotifyId: user.spotifyId,
      isNewUser: !user.createdAt
    });

    // Redirect to frontend with token
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/auth/callback?token=${jwtToken}&user=${encodeURIComponent(JSON.stringify({
      id: user._id,
      displayName: user.displayName,
      email: user.email,
      spotifyId: user.spotifyId,
      images: user.spotifyProfile.images
    }))}`);

  } catch (error) {
    logger.error('Error in Spotify callback:', error);
    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/auth/error?error=${encodeURIComponent(error.message)}`);
  }
});

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh JWT token
 * @access  Private
 */
router.post('/refresh', authenticate, async (req, res) => {
  try {
    const user = req.user;
    
    // Check if Spotify token needs refresh
    if (user.isTokenExpired()) {
      const newTokens = await spotifyService.refreshAccessToken(user.tokens.refreshToken);
      
      user.tokens.accessToken = newTokens.accessToken;
      user.tokens.expiresAt = newTokens.expiresAt;
      if (newTokens.refreshToken) {
        user.tokens.refreshToken = newTokens.refreshToken;
      }
      
      await user.save();
    }

    // Generate new JWT token
    const jwtToken = generateToken(user._id);

    res.json({
      token: jwtToken,
      user: {
        id: user._id,
        displayName: user.displayName,
        email: user.email,
        spotifyId: user.spotifyId,
        preferences: user.preferences
      },
      spotifyTokenValid: !user.isTokenExpired()
    });

  } catch (error) {
    logger.error('Error refreshing token:', error);
    res.status(401).json({
      error: 'Failed to refresh token'
    });
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = req.user;
    
    res.json({
      user: {
        id: user._id,
        userId: user.userId,
        displayName: user.displayName,
        email: user.email,
        spotifyId: user.spotifyId,
        spotifyProfile: user.spotifyProfile,
        preferences: user.preferences,
        locationDefault: user.locationDefault,
        createdAt: user.createdAt
      },
      spotifyTokenValid: !user.isTokenExpired()
    });

  } catch (error) {
    logger.error('Error getting user profile:', error);
    res.status(500).json({
      error: 'Failed to get user profile'
    });
  }
});

/**
 * @route   PUT /api/auth/preferences
 * @desc    Update user preferences
 * @access  Private
 */
router.put('/preferences', authenticate, async (req, res) => {
  try {
    const { preferences } = req.body;
    const user = req.user;

    // Validate preferences
    const allowedPreferences = [
      'autoCreatePlaylists',
      'enableLocationTracking',
      'defaultRegion',
      'language',
      'avoidExplicit'
    ];

    const filteredPreferences = {};
    for (const key of allowedPreferences) {
      if (preferences[key] !== undefined) {
        filteredPreferences[key] = preferences[key];
      }
    }

    // Update user preferences
    user.preferences = {
      ...user.preferences,
      ...filteredPreferences
    };

    await user.save();

    logger.info('User preferences updated', {
      userId: user._id,
      preferences: filteredPreferences
    });

    res.json({
      success: true,
      preferences: user.preferences
    });

  } catch (error) {
    logger.error('Error updating preferences:', error);
    res.status(500).json({
      error: 'Failed to update preferences'
    });
  }
});

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (invalidate tokens)
 * @access  Private
 */
router.post('/logout', authenticate, async (req, res) => {
  try {
    const user = req.user;
    
    // For now, we'll just return success
    // In a production system, you might want to blacklist the JWT token
    // or store token blacklist in Redis
    
    logger.info('User logged out', {
      userId: user._id
    });

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    logger.error('Error during logout:', error);
    res.status(500).json({
      error: 'Failed to logout'
    });
  }
});

/**
 * @route   DELETE /api/auth/account
 * @desc    Delete user account
 * @access  Private
 */
router.delete('/account', authenticate, async (req, res) => {
  try {
    const user = req.user;
    
    // Mark user as inactive instead of deleting
    // This preserves data integrity and analytics
    user.isActive = false;
    user.tokens = undefined; // Clear tokens
    
    await user.save();

    logger.info('User account deactivated', {
      userId: user._id,
      email: user.email
    });

    res.json({
      success: true,
      message: 'Account deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting account:', error);
    res.status(500).json({
      error: 'Failed to delete account'
    });
  }
});

module.exports = router;