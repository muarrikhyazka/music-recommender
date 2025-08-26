const logger = require('../utils/logger');
const redisClient = require('../config/redis');

class MetricsService {
  constructor() {
    this.metrics = new Map();
    this.counters = new Map();
    this.timers = new Map();
    this.histograms = new Map();
    
    // Flush metrics to storage periodically
    this.flushInterval = setInterval(() => {
      this.flushMetrics().catch(err => {
        logger.error('Error flushing metrics:', err);
      });
    }, 60000); // Flush every minute
  }

  /**
   * Increment a counter metric
   */
  counter(name, value = 1, tags = {}) {
    const key = this.buildMetricKey(name, tags);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
    
    // Also store in Redis for persistence
    this.storeMetricInRedis(`counter:${key}`, current + value);
  }

  /**
   * Record a gauge metric (current value)
   */
  gauge(name, value, tags = {}) {
    const key = this.buildMetricKey(name, tags);
    this.metrics.set(key, {
      type: 'gauge',
      value,
      timestamp: Date.now(),
      tags
    });
    
    this.storeMetricInRedis(`gauge:${key}`, value);
  }

  /**
   * Record a histogram metric (for latencies, etc.)
   */
  histogram(name, value, tags = {}) {
    const key = this.buildMetricKey(name, tags);
    
    if (!this.histograms.has(key)) {
      this.histograms.set(key, {
        values: [],
        count: 0,
        sum: 0,
        min: Number.MAX_SAFE_INTEGER,
        max: Number.MIN_SAFE_INTEGER
      });
    }
    
    const hist = this.histograms.get(key);
    hist.values.push(value);
    hist.count++;
    hist.sum += value;
    hist.min = Math.min(hist.min, value);
    hist.max = Math.max(hist.max, value);
    
    // Keep only last 1000 values to prevent memory issues
    if (hist.values.length > 1000) {
      hist.values = hist.values.slice(-1000);
    }
    
    // Store summary stats in Redis
    this.storeMetricInRedis(`histogram:${key}`, {
      count: hist.count,
      sum: hist.sum,
      min: hist.min,
      max: hist.max,
      avg: hist.sum / hist.count,
      p95: this.calculatePercentile(hist.values, 0.95),
      p99: this.calculatePercentile(hist.values, 0.99)
    });
  }

  /**
   * Start a timer
   */
  timerStart(name, tags = {}) {
    const key = this.buildMetricKey(name, tags);
    this.timers.set(key, Date.now());
    return key;
  }

  /**
   * End a timer and record the duration
   */
  timerEnd(key) {
    const startTime = this.timers.get(key);
    if (startTime) {
      const duration = Date.now() - startTime;
      this.timers.delete(key);
      
      // Extract name and tags from key for histogram
      const [name] = key.split('|');
      this.histogram(name, duration, {});
      
      return duration;
    }
    return null;
  }

  /**
   * Record API request metrics
   */
  recordApiRequest(req, res, duration) {
    const method = req.method;
    const route = req.route?.path || req.path;
    const status = res.statusCode;
    const statusClass = `${Math.floor(status / 100)}xx`;
    
    const tags = {
      method,
      route,
      status: statusClass
    };
    
    this.counter('api.requests.total', 1, tags);
    this.histogram('api.request.duration', duration, tags);
    
    if (status >= 400) {
      this.counter('api.requests.errors', 1, tags);
    }
  }

  /**
   * Record recommendation metrics
   */
  recordRecommendation(type, processingTime, confidence, trackCount, success = true) {
    const tags = { type };
    
    this.counter('recommendations.generated', 1, tags);
    this.histogram('recommendations.processing_time', processingTime, tags);
    this.gauge('recommendations.last_confidence', confidence, tags);
    this.histogram('recommendations.track_count', trackCount, tags);
    
    if (success) {
      this.counter('recommendations.success', 1, tags);
    } else {
      this.counter('recommendations.errors', 1, tags);
    }
  }

  /**
   * Record user engagement metrics
   */
  recordEngagement(action, userId = null) {
    const tags = { action };
    if (userId) tags.userId = userId;
    
    this.counter('user.engagement', 1, tags);
  }

  /**
   * Record Spotify API metrics
   */
  recordSpotifyApi(endpoint, duration, success = true) {
    const tags = { endpoint };
    
    this.counter('spotify.api.requests', 1, tags);
    this.histogram('spotify.api.duration', duration, tags);
    
    if (success) {
      this.counter('spotify.api.success', 1, tags);
    } else {
      this.counter('spotify.api.errors', 1, tags);
    }
  }

  /**
   * Record context collection metrics
   */
  recordContext(type, duration, success = true) {
    const tags = { type };
    
    this.counter('context.collected', 1, tags);
    this.histogram('context.collection_time', duration, tags);
    
    if (success) {
      this.counter('context.success', 1, tags);
    } else {
      this.counter('context.errors', 1, tags);
    }
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    const result = {
      counters: Array.from(this.counters.entries()).map(([key, value]) => ({
        name: key,
        value,
        type: 'counter'
      })),
      gauges: Array.from(this.metrics.entries())
        .filter(([, metric]) => metric.type === 'gauge')
        .map(([key, metric]) => ({
          name: key,
          value: metric.value,
          type: 'gauge',
          timestamp: metric.timestamp
        })),
      histograms: Array.from(this.histograms.entries()).map(([key, hist]) => ({
        name: key,
        type: 'histogram',
        count: hist.count,
        sum: hist.sum,
        min: hist.min,
        max: hist.max,
        avg: hist.sum / hist.count,
        p95: this.calculatePercentile(hist.values, 0.95),
        p99: this.calculatePercentile(hist.values, 0.99)
      }))
    };
    
    return result;
  }

  /**
   * Get metrics from Redis (persistent storage)
   */
  async getPersistedMetrics() {
    try {
      if (!redisClient.isConnected()) {
        return { error: 'Redis not connected' };
      }

      const counterKeys = await redisClient.keys('counter:*');
      const gaugeKeys = await redisClient.keys('gauge:*');
      const histogramKeys = await redisClient.keys('histogram:*');

      const [counters, gauges, histograms] = await Promise.all([
        Promise.all(counterKeys.map(async key => {
          const value = await redisClient.get(key);
          return { name: key.replace('counter:', ''), value, type: 'counter' };
        })),
        Promise.all(gaugeKeys.map(async key => {
          const value = await redisClient.get(key);
          return { name: key.replace('gauge:', ''), value, type: 'gauge' };
        })),
        Promise.all(histogramKeys.map(async key => {
          const value = await redisClient.get(key);
          return { name: key.replace('histogram:', ''), ...value, type: 'histogram' };
        }))
      ]);

      return { counters, gauges, histograms };
    } catch (error) {
      logger.error('Error getting persisted metrics:', error);
      return { error: error.message };
    }
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.metrics.clear();
    this.counters.clear();
    this.timers.clear();
    this.histograms.clear();
    
    // Also clear from Redis
    if (redisClient.isConnected()) {
      redisClient.flushPattern('counter:*');
      redisClient.flushPattern('gauge:*');
      redisClient.flushPattern('histogram:*');
    }
  }

  /**
   * Build metric key with tags
   */
  buildMetricKey(name, tags = {}) {
    const tagPairs = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`);
    
    return tagPairs.length > 0 ? `${name}|${tagPairs.join(',')}` : name;
  }

  /**
   * Calculate percentile
   */
  calculatePercentile(values, percentile) {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  /**
   * Store metric in Redis
   */
  async storeMetricInRedis(key, value) {
    try {
      if (redisClient.isConnected()) {
        await redisClient.set(key, value, 3600); // 1 hour TTL
      }
    } catch (error) {
      // Silently fail - metrics storage shouldn't break the app
      logger.debug('Failed to store metric in Redis:', error.message);
    }
  }

  /**
   * Flush metrics to storage
   */
  async flushMetrics() {
    try {
      const metrics = this.getMetrics();
      
      // Log metrics summary
      const summary = {
        counters: metrics.counters.length,
        gauges: metrics.gauges.length,
        histograms: metrics.histograms.length,
        timestamp: new Date().toISOString()
      };
      
      logger.debug('Metrics flush:', summary);
      
      // Here you could send metrics to external services like:
      // - DataDog
      // - New Relic
      // - Prometheus
      // - Custom analytics service
      
    } catch (error) {
      logger.error('Error flushing metrics:', error);
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
  }
}

module.exports = new MetricsService();