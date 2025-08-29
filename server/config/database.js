const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    // Handle MongoDB URI with special characters in password
    let mongoUri = process.env.MONGODB_URI;
    
    // If the URI contains credentials, manually encode the password
    if (mongoUri && mongoUri.includes('://') && mongoUri.includes('@')) {
      // Extract parts manually to handle special characters
      const [protocol, rest] = mongoUri.split('://');
      const [credentials, hostAndPath] = rest.split('@');
      
      if (credentials.includes(':')) {
        const [username, password] = credentials.split(':');
        const encodedPassword = encodeURIComponent(password);
        mongoUri = `${protocol}://${username}:${encodedPassword}@${hostAndPath}`;
      }
    }
    
    const conn = await mongoose.connect(mongoUri, {
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    logger.info(`MongoDB connected: ${conn.connection.host}`);

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });

  } catch (error) {
    logger.error('Database connection failed:', error);
    process.exit(1);
  }
};

module.exports = connectDB;