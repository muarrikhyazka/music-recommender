const metricsService = require('../services/metricsService');

/**
 * Middleware to collect API metrics
 */
const collectMetrics = (req, res, next) => {
  const startTime = Date.now();
  
  // Override res.end to capture metrics when response is sent
  const originalEnd = res.end;
  
  res.end = function(...args) {
    const duration = Date.now() - startTime;
    
    // Record API request metrics
    metricsService.recordApiRequest(req, res, duration);
    
    // Call original end function
    originalEnd.apply(this, args);
  };
  
  next();
};

/**
 * Middleware to track user engagement
 */
const trackEngagement = (action) => {
  return (req, res, next) => {
    // Record engagement after request is processed
    const originalEnd = res.end;
    
    res.end = function(...args) {
      if (res.statusCode < 400) {
        metricsService.recordEngagement(action, req.userId);
      }
      
      originalEnd.apply(this, args);
    };
    
    next();
  };
};

/**
 * Create a timer for measuring operation duration
 */
const createTimer = (name, tags = {}) => {
  return metricsService.timerStart(name, tags);
};

/**
 * End a timer and record the duration
 */
const endTimer = (timerKey) => {
  return metricsService.timerEnd(timerKey);
};

/**
 * Record custom metric
 */
const recordMetric = (type, name, value, tags = {}) => {
  switch (type) {
    case 'counter':
      metricsService.counter(name, value, tags);
      break;
    case 'gauge':
      metricsService.gauge(name, value, tags);
      break;
    case 'histogram':
      metricsService.histogram(name, value, tags);
      break;
    default:
      throw new Error(`Unknown metric type: ${type}`);
  }
};

module.exports = {
  collectMetrics,
  trackEngagement,
  createTimer,
  endTimer,
  recordMetric
};