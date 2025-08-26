const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Middleware to authenticate JWT tokens
 */
const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        error: 'Access denied. No token provided.' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user || !user.isActive) {
      return res.status(401).json({ 
        error: 'Invalid token or user not found.' 
      });
    }

    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    res.status(401).json({ 
      error: 'Invalid token.' 
    });
  }
};

/**
 * Middleware to check if user has valid Spotify tokens
 */
const requireSpotifyAuth = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'User authentication required'
      });
    }

    const user = await User.findById(req.user._id).select('+tokens');
    
    if (!user.tokens || !user.tokens.accessToken || !user.tokens.refreshToken) {
      return res.status(403).json({
        error: 'Spotify authentication required',
        requiresSpotifyAuth: true,
        authUrl: '/api/auth/spotify'
      });
    }

    req.user = user; // Update with tokens
    next();
  } catch (error) {
    logger.error('Spotify auth check error:', error);
    res.status(500).json({ 
      error: 'Failed to verify Spotify authentication' 
    });
  }
};

/**
 * Middleware to check if user has specific permissions
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    // For now, all authenticated users have all permissions
    // In the future, you could implement role-based access control
    const userPermissions = req.user.permissions || ['read', 'write'];
    
    if (!userPermissions.includes(permission)) {
      return res.status(403).json({
        error: `Permission '${permission}' required`
      });
    }

    next();
  };
};

/**
 * Optional authentication middleware - doesn't fail if no token
 */
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);
      
      if (user && user.isActive) {
        req.user = user;
        req.userId = user._id;
      }
    }
    
    next();
  } catch (error) {
    // Continue without authentication
    logger.debug('Optional auth failed:', error.message);
    next();
  }
};

/**
 * Generate JWT token for user
 */
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
};

/**
 * Extract user ID from token without verification
 */
const extractUserId = (token) => {
  try {
    const decoded = jwt.decode(token);
    return decoded?.userId;
  } catch (error) {
    return null;
  }
};

module.exports = {
  authenticate,
  requireSpotifyAuth,
  requirePermission,
  optionalAuth,
  generateToken,
  extractUserId
};