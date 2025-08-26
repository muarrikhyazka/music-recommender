const logger = require('../utils/logger');

const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  
  logger.error('API Error:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    statusCode
  });

  res.status(statusCode);

  const errorResponse = {
    message: err.message,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method
  };

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
  }

  // Handle specific error types
  if (err.name === 'ValidationError') {
    errorResponse.errors = Object.values(err.errors).map(val => val.message);
    res.status(400);
  }

  if (err.name === 'CastError') {
    errorResponse.message = 'Invalid resource ID';
    res.status(400);
  }

  if (err.code === 11000) {
    errorResponse.message = 'Duplicate resource';
    res.status(400);
  }

  if (err.name === 'JsonWebTokenError') {
    errorResponse.message = 'Invalid token';
    res.status(401);
  }

  if (err.name === 'TokenExpiredError') {
    errorResponse.message = 'Token expired';
    res.status(401);
  }

  res.json(errorResponse);
};

module.exports = {
  notFound,
  errorHandler
};