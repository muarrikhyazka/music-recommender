const mongoose = require('mongoose');

const recommendationLogSchema = new mongoose.Schema({
  recId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  playlistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Playlist'
  },
  contextId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ContextLog',
    required: true
  },
  deliveredAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  recommendationType: {
    type: String,
    enum: ['context_based', 'collaborative', 'content_based', 'hybrid', 'fallback'],
    default: 'hybrid'
  },
  algorithm: {
    version: { type: String, default: '1.0' },
    model: String,
    confidence: { type: Number, min: 0, max: 1 },
    processingTime: Number
  },
  input: {
    context: {
      timeOfDay: String,
      weather: String,
      temperature: Number,
      location: String,
      mood: String,
      activity: String
    },
    userProfile: {
      topGenres: [String],
      topArtists: [String],
      recentTracks: [String],
      listeningPatterns: mongoose.Schema.Types.Mixed
    },
    appliedRules: [{
      ruleId: String,
      weight: Number,
      matchScore: Number
    }]
  },
  output: {
    tracks: [{
      spotifyTrackId: String,
      title: String,
      artist: String,
      score: Number,
      reasons: [String],
      position: Number
    }],
    playlistName: String,
    playlistDescription: String,
    totalTracks: Number,
    totalDuration: Number,
    diversity: {
      genreCount: Number,
      artistCount: Number,
      tempoVariance: Number,
      moodVariance: Number
    }
  },
  userInteraction: {
    clicked: {
      type: Boolean,
      default: false
    },
    clickedAt: Date,
    opened: {
      type: Boolean,
      default: false
    },
    openedAt: Date,
    played: {
      type: Boolean,
      default: false
    },
    playedAt: Date,
    saved: {
      type: Boolean,
      default: false
    },
    savedAt: Date,
    shared: {
      type: Boolean,
      default: false
    },
    sharedAt: Date,
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    ratedAt: Date,
    feedback: {
      liked: Boolean,
      disliked: Boolean,
      reasons: [String],
      comment: String
    },
    sessionDuration: Number,
    tracksPlayed: Number,
    tracksSkipped: Number,
    completionRate: Number
  },
  performance: {
    ctr: Number, // Click-through rate
    ptr: Number, // Play-through rate
    str: Number, // Save-through rate
    avgRating: Number,
    engagementScore: Number
  },
  abTestGroup: String,
  errors: [{
    type: String,
    message: String,
    timestamp: { type: Date, default: Date.now }
  }],
  metadata: {
    device: String,
    platform: String,
    appVersion: String,
    sessionId: String,
    requestId: String
  }
}, {
  timestamps: true
});

// Indexes for efficient querying and analytics
recommendationLogSchema.index({ userId: 1, deliveredAt: -1 });
recommendationLogSchema.index({ deliveredAt: -1 });
recommendationLogSchema.index({ 'userInteraction.clicked': 1 });
recommendationLogSchema.index({ 'userInteraction.played': 1 });
recommendationLogSchema.index({ 'userInteraction.saved': 1 });
recommendationLogSchema.index({ recommendationType: 1 });
recommendationLogSchema.index({ abTestGroup: 1 });

// TTL index - automatically delete documents after 1 year
recommendationLogSchema.index({ deliveredAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 });

// Virtual properties
recommendationLogSchema.virtual('isEngaged').get(function() {
  return this.userInteraction.clicked || this.userInteraction.played || this.userInteraction.saved;
});

recommendationLogSchema.virtual('totalEngagementTime').get(function() {
  let totalTime = 0;
  if (this.userInteraction.clickedAt) totalTime += 1;
  if (this.userInteraction.sessionDuration) totalTime += this.userInteraction.sessionDuration;
  return totalTime;
});

// Methods
recommendationLogSchema.methods.recordClick = function() {
  this.userInteraction.clicked = true;
  this.userInteraction.clickedAt = new Date();
  return this.save();
};

recommendationLogSchema.methods.recordOpen = function() {
  this.userInteraction.opened = true;
  this.userInteraction.openedAt = new Date();
  return this.save();
};

recommendationLogSchema.methods.recordPlay = function() {
  this.userInteraction.played = true;
  this.userInteraction.playedAt = new Date();
  return this.save();
};

recommendationLogSchema.methods.recordSave = function() {
  this.userInteraction.saved = true;
  this.userInteraction.savedAt = new Date();
  return this.save();
};

recommendationLogSchema.methods.recordRating = function(rating, feedback = null) {
  this.userInteraction.rating = rating;
  this.userInteraction.ratedAt = new Date();
  if (feedback) {
    this.userInteraction.feedback = feedback;
  }
  return this.save();
};

recommendationLogSchema.methods.updatePlayStats = function(tracksPlayed, tracksSkipped, sessionDuration) {
  this.userInteraction.tracksPlayed = tracksPlayed;
  this.userInteraction.tracksSkipped = tracksSkipped;
  this.userInteraction.sessionDuration = sessionDuration;
  
  if (this.output.totalTracks > 0) {
    this.userInteraction.completionRate = (tracksPlayed / this.output.totalTracks) * 100;
  }
  
  return this.save();
};

recommendationLogSchema.methods.calculateEngagementScore = function() {
  let score = 0;
  
  if (this.userInteraction.clicked) score += 1;
  if (this.userInteraction.opened) score += 2;
  if (this.userInteraction.played) score += 3;
  if (this.userInteraction.saved) score += 5;
  if (this.userInteraction.shared) score += 4;
  if (this.userInteraction.rating) score += this.userInteraction.rating;
  
  // Bonus for completion rate
  if (this.userInteraction.completionRate) {
    score += (this.userInteraction.completionRate / 100) * 2;
  }
  
  this.performance.engagementScore = score;
  return this.save();
};

// Static methods for analytics
recommendationLogSchema.statics.getPerformanceMetrics = function(startDate, endDate, filters = {}) {
  const matchStage = {
    deliveredAt: { $gte: startDate, $lte: endDate },
    ...filters
  };
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalRecommendations: { $sum: 1 },
        totalClicks: { $sum: { $cond: ['$userInteraction.clicked', 1, 0] } },
        totalPlays: { $sum: { $cond: ['$userInteraction.played', 1, 0] } },
        totalSaves: { $sum: { $cond: ['$userInteraction.saved', 1, 0] } },
        avgRating: { $avg: '$userInteraction.rating' },
        avgEngagementScore: { $avg: '$performance.engagementScore' },
        avgProcessingTime: { $avg: '$algorithm.processingTime' }
      }
    },
    {
      $project: {
        _id: 0,
        totalRecommendations: 1,
        ctr: { $divide: ['$totalClicks', '$totalRecommendations'] },
        ptr: { $divide: ['$totalPlays', '$totalRecommendations'] },
        str: { $divide: ['$totalSaves', '$totalRecommendations'] },
        avgRating: 1,
        avgEngagementScore: 1,
        avgProcessingTime: 1
      }
    }
  ]);
};

recommendationLogSchema.statics.getUserEngagementHistory = function(userId, limit = 50) {
  return this.find({ userId })
    .sort({ deliveredAt: -1 })
    .limit(limit)
    .select('deliveredAt userInteraction performance output.playlistName input.context')
    .lean();
};

recommendationLogSchema.statics.getPopularContexts = function(days = 30, limit = 20) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        deliveredAt: { $gte: startDate },
        'userInteraction.played': true
      }
    },
    {
      $group: {
        _id: {
          timeOfDay: '$input.context.timeOfDay',
          weather: '$input.context.weather',
          location: '$input.context.location'
        },
        count: { $sum: 1 },
        avgEngagement: { $avg: '$performance.engagementScore' },
        avgRating: { $avg: '$userInteraction.rating' }
      }
    },
    {
      $sort: { count: -1, avgEngagement: -1 }
    },
    { $limit: limit }
  ]);
};

recommendationLogSchema.statics.getAlgorithmPerformance = function(days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        deliveredAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          type: '$recommendationType',
          version: '$algorithm.version'
        },
        count: { $sum: 1 },
        avgConfidence: { $avg: '$algorithm.confidence' },
        avgEngagement: { $avg: '$performance.engagementScore' },
        avgProcessingTime: { $avg: '$algorithm.processingTime' },
        successRate: {
          $avg: {
            $cond: ['$userInteraction.played', 1, 0]
          }
        }
      }
    },
    {
      $sort: { successRate: -1, avgEngagement: -1 }
    }
  ]);
};

module.exports = mongoose.model('RecommendationLog', recommendationLogSchema);