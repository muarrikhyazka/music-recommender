const mongoose = require('mongoose');

const contextLogSchema = new mongoose.Schema({
  contextId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  },
  timeOfDay: {
    type: String,
    enum: ['morning', 'afternoon', 'evening', 'night'],
    required: true
  },
  geoLocation: {
    city: { type: String, required: true },
    country: { type: String, required: true },
    region: String,
    timezone: String,
    coordinates: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true }
    },
    accuracy: Number
  },
  weather: {
    condition: {
      type: String,
      enum: ['sunny', 'cloudy', 'partly_cloudy', 'rainy', 'stormy', 'snow', 'fog'],
      required: true
    },
    temperature: { type: Number, required: true },
    feelsLike: Number,
    humidity: Number,
    windSpeed: Number,
    pressure: Number,
    uvIndex: Number,
    visibility: Number,
    cloudCover: Number
  },
  season: {
    type: String,
    enum: ['spring', 'summer', 'autumn', 'winter']
  },
  deviceInfo: {
    platform: String,
    userAgent: String,
    screenSize: String,
    connection: String
  },
  activityContext: {
    detectedActivity: {
      type: String,
      enum: ['stationary', 'walking', 'driving', 'commuting', 'working', 'exercising', 'sleeping']
    },
    confidence: Number,
    duration: Number
  },
  moodDetected: {
    primary: {
      type: String,
      enum: ['happy', 'sad', 'energetic', 'calm', 'stressed', 'relaxed', 'focused', 'social']
    },
    secondary: String,
    confidence: Number,
    source: {
      type: String,
      enum: ['manual', 'inferred', 'context', 'history']
    }
  },
  socialContext: {
    alone: { type: Boolean, default: true },
    groupSize: Number,
    occasion: String
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
contextLogSchema.index({ userId: 1, timestamp: -1 });
contextLogSchema.index({ timeOfDay: 1 });
contextLogSchema.index({ 'weather.condition': 1 });
contextLogSchema.index({ 'weather.temperature': 1 });
contextLogSchema.index({ 'geoLocation.city': 1 });
contextLogSchema.index({ 'geoLocation.country': 1 });
contextLogSchema.index({ season: 1 });
contextLogSchema.index({ 'moodDetected.primary': 1 });

// TTL index - automatically delete documents after 90 days
contextLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

// Virtual for getting local time
contextLogSchema.virtual('localTime').get(function() {
  if (!this.geoLocation?.timezone) return this.timestamp;
  return new Date(this.timestamp.toLocaleString('en-US', { timeZone: this.geoLocation.timezone }));
});

// Methods
contextLogSchema.methods.getContextFingerprint = function() {
  return `${this.timeOfDay}_${this.weather.condition}_${this.weather.temperature}_${this.geoLocation.city}`;
};

contextLogSchema.methods.getSimilarContexts = function(similarity = 0.8) {
  const query = {
    userId: this.userId,
    _id: { $ne: this._id }
  };

  // Time similarity (±2 hours)
  const timeMatch = ['morning', 'afternoon', 'evening', 'night'];
  const currentTimeIndex = timeMatch.indexOf(this.timeOfDay);
  const similarTimes = [
    timeMatch[currentTimeIndex],
    timeMatch[currentTimeIndex - 1],
    timeMatch[currentTimeIndex + 1]
  ].filter(Boolean);
  
  query.timeOfDay = { $in: similarTimes };

  // Weather similarity
  query['weather.condition'] = this.weather.condition;
  
  // Temperature similarity (±5 degrees)
  query['weather.temperature'] = {
    $gte: this.weather.temperature - 5,
    $lte: this.weather.temperature + 5
  };

  // Location similarity
  query['geoLocation.city'] = this.geoLocation.city;

  return this.constructor.find(query);
};

// Static methods
contextLogSchema.statics.getRecentContext = function(userId, limit = 1) {
  return this.findOne({ userId })
    .sort({ timestamp: -1 })
    .limit(limit);
};

contextLogSchema.statics.getContextPatterns = function(userId, days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        timestamp: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          timeOfDay: '$timeOfDay',
          weather: '$weather.condition',
          city: '$geoLocation.city'
        },
        count: { $sum: 1 },
        avgTemp: { $avg: '$weather.temperature' },
        moods: { $addToSet: '$moodDetected.primary' },
        lastSeen: { $max: '$timestamp' }
      }
    },
    {
      $sort: { count: -1, lastSeen: -1 }
    }
  ]);
};

contextLogSchema.statics.getWeatherPreferences = function(userId, days = 90) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        timestamp: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$weather.condition',
        count: { $sum: 1 },
        avgTemp: { $avg: '$weather.temperature' },
        preferredTimes: { $addToSet: '$timeOfDay' }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
};

contextLogSchema.statics.getMoodPatterns = function(userId, days = 60) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        timestamp: { $gte: startDate },
        'moodDetected.primary': { $exists: true }
      }
    },
    {
      $group: {
        _id: {
          mood: '$moodDetected.primary',
          timeOfDay: '$timeOfDay',
          weather: '$weather.condition'
        },
        count: { $sum: 1 },
        avgConfidence: { $avg: '$moodDetected.confidence' }
      }
    },
    {
      $sort: { count: -1, avgConfidence: -1 }
    }
  ]);
};

module.exports = mongoose.model('ContextLog', contextLogSchema);