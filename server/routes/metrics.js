const express = require('express');
const router = express.Router();
const metricsService = require('../services/metricsService');
const redisClient = require('../config/redis');
const logger = require('../utils/logger');

/**
 * @route   GET /api/metrics
 * @desc    Get current metrics
 * @access  Public (should be restricted in production)
 */
router.get('/', async (req, res) => {
  try {
    const { format = 'json', persisted = false } = req.query;
    
    let metrics;
    if (persisted === 'true') {
      metrics = await metricsService.getPersistedMetrics();
    } else {
      metrics = metricsService.getMetrics();
    }
    
    if (format === 'prometheus') {
      // Convert to Prometheus format
      let output = '';
      
      // Counters
      metrics.counters?.forEach(metric => {
        output += `# TYPE ${metric.name.replace(/[^a-zA-Z0-9_]/g, '_')} counter\n`;
        output += `${metric.name.replace(/[^a-zA-Z0-9_]/g, '_')} ${metric.value}\n`;
      });
      
      // Gauges
      metrics.gauges?.forEach(metric => {
        output += `# TYPE ${metric.name.replace(/[^a-zA-Z0-9_]/g, '_')} gauge\n`;
        output += `${metric.name.replace(/[^a-zA-Z0-9_]/g, '_')} ${metric.value}\n`;
      });
      
      // Histograms
      metrics.histograms?.forEach(metric => {
        const name = metric.name.replace(/[^a-zA-Z0-9_]/g, '_');
        output += `# TYPE ${name} histogram\n`;
        output += `${name}_count ${metric.count}\n`;
        output += `${name}_sum ${metric.sum}\n`;
        output += `${name}_bucket{le="+Inf"} ${metric.count}\n`;
      });
      
      res.type('text/plain');
      res.send(output);
    } else {
      res.json({
        success: true,
        metrics,
        timestamp: new Date().toISOString(),
        source: persisted === 'true' ? 'redis' : 'memory'
      });
    }
    
  } catch (error) {
    logger.error('Error getting metrics:', error);
    res.status(500).json({
      error: 'Failed to get metrics'
    });
  }
});

/**
 * @route   POST /api/metrics/clear
 * @desc    Clear all metrics
 * @access  Private (should be admin only)
 */
router.post('/clear', (req, res) => {
  try {
    metricsService.clear();
    
    logger.info('Metrics cleared');
    
    res.json({
      success: true,
      message: 'Metrics cleared successfully'
    });
    
  } catch (error) {
    logger.error('Error clearing metrics:', error);
    res.status(500).json({
      error: 'Failed to clear metrics'
    });
  }
});

/**
 * @route   GET /api/metrics/health
 * @desc    Health check for metrics and monitoring services
 * @access  Public
 */
router.get('/health', async (req, res) => {
  try {
    const health = {
      metrics: {
        status: 'healthy',
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime()
      },
      redis: {
        status: redisClient.isConnected() ? 'healthy' : 'disconnected',
        connected: redisClient.isConnected()
      },
      timestamp: new Date().toISOString()
    };
    
    // Get Redis stats if connected
    if (redisClient.isConnected()) {
      try {
        const redisStats = await redisClient.getStats();
        health.redis.stats = redisStats;
      } catch (error) {
        health.redis.status = 'error';
        health.redis.error = error.message;
      }
    }
    
    const isHealthy = health.metrics.status === 'healthy';
    
    res.status(isHealthy ? 200 : 503).json(health);
    
  } catch (error) {
    logger.error('Error getting metrics health:', error);
    res.status(503).json({
      status: 'error',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route   GET /api/metrics/summary
 * @desc    Get metrics summary for dashboard
 * @access  Public
 */
router.get('/summary', async (req, res) => {
  try {
    const metrics = metricsService.getMetrics();
    
    // Calculate summary statistics
    const summary = {
      requests: {
        total: metrics.counters.find(m => m.name.includes('api.requests.total'))?.value || 0,
        errors: metrics.counters.find(m => m.name.includes('api.requests.errors'))?.value || 0,
        avgDuration: metrics.histograms.find(m => m.name.includes('api.request.duration'))?.avg || 0
      },
      recommendations: {
        generated: metrics.counters.find(m => m.name.includes('recommendations.generated'))?.value || 0,
        success: metrics.counters.find(m => m.name.includes('recommendations.success'))?.value || 0,
        avgProcessingTime: metrics.histograms.find(m => m.name.includes('recommendations.processing_time'))?.avg || 0,
        lastConfidence: metrics.gauges.find(m => m.name.includes('recommendations.last_confidence'))?.value || 0
      },
      spotify: {
        requests: metrics.counters.find(m => m.name.includes('spotify.api.requests'))?.value || 0,
        success: metrics.counters.find(m => m.name.includes('spotify.api.success'))?.value || 0,
        avgDuration: metrics.histograms.find(m => m.name.includes('spotify.api.duration'))?.avg || 0
      },
      context: {
        collected: metrics.counters.find(m => m.name.includes('context.collected'))?.value || 0,
        success: metrics.counters.find(m => m.name.includes('context.success'))?.value || 0,
        avgCollectionTime: metrics.histograms.find(m => m.name.includes('context.collection_time'))?.avg || 0
      },
      system: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage()
      }
    };
    
    // Calculate success rates
    summary.requests.successRate = summary.requests.total > 0 ? 
      ((summary.requests.total - summary.requests.errors) / summary.requests.total) * 100 : 0;
    
    summary.recommendations.successRate = summary.recommendations.generated > 0 ?
      (summary.recommendations.success / summary.recommendations.generated) * 100 : 0;
    
    summary.spotify.successRate = summary.spotify.requests > 0 ?
      (summary.spotify.success / summary.spotify.requests) * 100 : 0;
    
    summary.context.successRate = summary.context.collected > 0 ?
      (summary.context.success / summary.context.collected) * 100 : 0;
    
    res.json({
      success: true,
      summary,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting metrics summary:', error);
    res.status(500).json({
      error: 'Failed to get metrics summary'
    });
  }
});

module.exports = router;