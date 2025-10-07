const winston = require('winston');
const path = require('path');
const KafkaTransport = require('./kafkaTransport');

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: {
    service: 'music-recommender',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    // Kafka transport for log monitoring
    new KafkaTransport({
      level: 'info',
      serviceName: 'music-recommender',
      brokers: (process.env.KAFKA_BOOTSTRAP_SERVERS || 'localhost:9092').split(','),
      topic: 'logs'
    })
  ]
});

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  const logDir = path.join(__dirname, '../../logs');
  
  logger.add(new winston.transports.File({
    filename: path.join(logDir, 'error.log'),
    level: 'error',
    maxsize: 5242880, // 5MB
    maxFiles: 10
  }));
  
  logger.add(new winston.transports.File({
    filename: path.join(logDir, 'combined.log'),
    maxsize: 5242880, // 5MB
    maxFiles: 10
  }));
}

// Create a stream for morgan HTTP logging
logger.stream = {
  write: function(message) {
    logger.info(message.trim());
  }
};

module.exports = logger;