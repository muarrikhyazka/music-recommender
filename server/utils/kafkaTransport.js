const Transport = require('winston-transport');
const { Kafka } = require('kafkajs');

/**
 * Custom Winston transport for sending logs to Kafka
 */
class KafkaTransport extends Transport {
  constructor(opts = {}) {
    super(opts);

    this.kafka = new Kafka({
      clientId: opts.clientId || 'music-recommender-logger',
      brokers: opts.brokers || ['localhost:9092'],
      retry: {
        retries: 3,
        initialRetryTime: 100
      }
    });

    this.producer = this.kafka.producer();
    this.topic = opts.topic || 'logs';
    this.serviceName = opts.serviceName || 'music-recommender';
    this.connecting = false;
    this.connected = false;

    // Connect to Kafka
    this.connect();
  }

  async connect() {
    if (this.connecting || this.connected) return;

    this.connecting = true;
    try {
      await this.producer.connect();
      this.connected = true;
      this.connecting = false;
      console.log('✓ Kafka log monitoring enabled for music-recommender');
    } catch (error) {
      this.connecting = false;
      this.connected = false;
      console.warn('Warning: Could not connect to Kafka for log monitoring:', error.message);
    }
  }

  async log(info, callback) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    // Only send if connected
    if (!this.connected) {
      callback();
      return;
    }

    try {
      const logEntry = {
        timestamp: new Date().toISOString(),
        service_name: this.serviceName,
        level: info.level.toUpperCase(),
        message: info.message,
        metadata: {
          ...info,
          level: undefined,
          message: undefined,
          timestamp: undefined
        }
      };

      await this.producer.send({
        topic: this.topic,
        messages: [{
          key: this.serviceName,
          value: JSON.stringify(logEntry)
        }]
      });
    } catch (error) {
      // Silently fail to not disrupt application
      console.warn('Failed to send log to Kafka:', error.message);
    }

    callback();
  }

  async close() {
    if (this.connected) {
      await this.producer.disconnect();
      this.connected = false;
    }
  }
}

module.exports = KafkaTransport;
