const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    // Encode password in MongoDB URI to handle special characters
    let mongoUri = process.env.MONGODB_URI;
    if (mongoUri && mongoUri.includes('://') && mongoUri.includes('@')) {
      const url = new URL(mongoUri);
      if (url.password) {
        url.password = encodeURIComponent(url.password);
        mongoUri = url.toString();
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