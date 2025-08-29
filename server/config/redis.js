const redis = require('redis');
const logger = require('../utils/logger');

class RedisClient {
  constructor() {
    this.client = null;
    this.connected = false;
  }

  async connect() {
    try {
      let redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
      
      // Fix Redis URL format by encoding password
      if (redisUrl && redisUrl.includes('://') && redisUrl.includes('@')) {
        try {
          const url = new URL(redisUrl);
          if (url.password) {
            url.password = encodeURIComponent(url.password);
            redisUrl = url.toString();
          }
        } catch (urlError) {
          logger.error('Invalid Redis URL format, falling back to redis container');
          redisUrl = 'redis://redis:6379';
        }
      }
      
      this.client = redis.createClient({
        url: redisUrl,
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            logger.error('Redis server connection refused');
            return new Error('Redis server connection refused');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            logger.error('Redis retry time exhausted');
            return new Error('Retry time exhausted');
          }
          if (options.attempt > 10) {
            logger.error('Redis max attempts reached');
            return undefined;
          }
          // reconnect after
          return Math.min(options.attempt * 100, 3000);
        }
      });

      this.client.on('connect', () => {
        logger.info('Redis client connected');
        this.connected = true;
      });

      this.client.on('error', (err) => {
        logger.error('Redis client error:', err);
        this.connected = false;
      });

      this.client.on('end', () => {
        logger.info('Redis client disconnected');
        this.connected = false;
      });

      await this.client.connect();
      
      // Test connection
      await this.client.ping();
      
      logger.info('Redis connection established successfully');
      
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      // Don't throw error - app should work without Redis
      this.connected = false;
    }
  }

  async get(key) {
    if (!this.connected || !this.client) {
      return null;
    }

    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis GET error:', error);
      return null;
    }
  }

  async set(key, value, ttl = 300) {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      const serialized = JSON.stringify(value);
      await this.client.setEx(key, ttl, serialized);
      return true;
    } catch (error) {
      logger.error('Redis SET error:', error);
      return false;
    }
  }

  async del(key) {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error('Redis DEL error:', error);
      return false;
    }
  }

  async exists(key) {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      const exists = await this.client.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error('Redis EXISTS error:', error);
      return false;
    }
  }

  async keys(pattern) {
    if (!this.connected || !this.client) {
      return [];
    }

    try {
      return await this.client.keys(pattern);
    } catch (error) {
      logger.error('Redis KEYS error:', error);
      return [];
    }
  }

  async flushPattern(pattern) {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      const keys = await this.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      return true;
    } catch (error) {
      logger.error('Redis flush pattern error:', error);
      return false;
    }
  }

  async getStats() {
    if (!this.connected || !this.client) {
      return null;
    }

    try {
      const info = await this.client.info('memory');
      const keyspace = await this.client.info('keyspace');
      
      return {
        connected: this.connected,
        memory: info,
        keyspace: keyspace,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Redis stats error:', error);
      return null;
    }
  }

  isConnected() {
    return this.connected;
  }

  async disconnect() {
    if (this.client) {
      try {
        await this.client.quit();
        logger.info('Redis client disconnected gracefully');
      } catch (error) {
        logger.error('Error disconnecting Redis:', error);
      }
    }
  }
}

const redisClient = new RedisClient();

module.exports = redisClient;