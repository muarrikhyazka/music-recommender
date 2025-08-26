const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

// Create different rate limiters for different endpoints
const createRateLimiter = (windowMs, max, message, skipSuccessfulRequests = false) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      error: message,
      retryAfter: Math.ceil(windowMs / 1000)
    },
    skipSuccessfulRequests,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.path
      });
      
      res.status(429).json({
        error: message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    },
    standardHeaders: true,
    legacyHeaders: false
  });
};

// General API rate limiter
const generalLimiter = createRateLimiter(
  parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // 100 requests per windowMs
  'Too many requests from this IP, please try again later.'
);

// Auth rate limiter (stricter)
const authLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  5, // 5 requests per windowMs
  'Too many authentication attempts, please try again later.',
  true // Skip successful requests
);

// Recommendation rate limiter
const recommendationLimiter = createRateLimiter(
  10 * 60 * 1000, // 10 minutes
  20, // 20 recommendations per windowMs
  'Too many recommendation requests, please try again later.'
);

// Context rate limiter
const contextLimiter = createRateLimiter(
  5 * 60 * 1000, // 5 minutes
  30, // 30 context requests per windowMs
  'Too many context requests, please try again later.'
);

module.exports = {
  general: generalLimiter,
  auth: authLimiter,
  recommendation: recommendationLimiter,
  context: contextLimiter
};