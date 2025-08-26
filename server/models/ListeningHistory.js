const mongoose = require('mongoose');

const listeningHistorySchema = new mongoose.Schema({
  historyId: {
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
  songId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Song',
    required: true
  },
  playlistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Playlist'
  },
  spotifyTrackId: {
    type: String,
    required: true
  },
  playedAt: {
    type: Date,
    required: true,
    index: true
  },
  source: {
    type: String,
    enum: ['generated_playlist', 'spotify_discover', 'user_library', 'search', 'radio'],
    default: 'generated_playlist'
  },
  context: {
    timeOfDay: String,
    weather: String,
    temperature: Number,
    location: {
      city: String,
      country: String
    },
    device: String,
    platform: String
  },
  interaction: {
    duration: { type: Number, default: 0 }, // in milliseconds
    completed: { type: Boolean, default: false },
    skipped: { type: Boolean, default: false },
    skipReason: {
      type: String,
      enum: ['dislike', 'next_song', 'change_context', 'interruption']
    },
    liked: { type: Boolean, default: false },
    shared: { type: Boolean, default: false }
  },
  sessionId: String,
  metadata: {
    volume: Number,
    quality: String,
    shuffle: Boolean,
    repeat: String
  }
}, {
  timestamps: true
});

// Indexes
listeningHistorySchema.index({ userId: 1, playedAt: -1 });
listeningHistorySchema.index({ songId: 1 });
listeningHistorySchema.index({ playlistId: 1 });
listeningHistorySchema.index({ spotifyTrackId: 1 });
listeningHistorySchema.index({ 'context.timeOfDay': 1 });
listeningHistorySchema.index({ 'context.weather': 1 });
listeningHistorySchema.index({ playedAt: -1 });
listeningHistorySchema.index({ sessionId: 1 });

// Virtual for completion percentage
listeningHistorySchema.virtual('completionPercentage').get(function() {
  if (!this.interaction.duration || !this.songId?.durationMs) return 0;
  return Math.min(100, (this.interaction.duration / this.songId.durationMs) * 100);
});

// Methods
listeningHistorySchema.methods.markAsCompleted = function() {
  this.interaction.completed = true;
  this.interaction.skipped = false;
  return this.save();
};

listeningHistorySchema.methods.markAsSkipped = function(reason = 'next_song') {
  this.interaction.skipped = true;
  this.interaction.skipReason = reason;
  this.interaction.completed = false;
  return this.save();
};

listeningHistorySchema.methods.updateDuration = function(duration) {
  this.interaction.duration = duration;
  // Consider completed if listened to more than 80% of the song
  if (this.songId?.durationMs && duration > (this.songId.durationMs * 0.8)) {
    this.interaction.completed = true;
  }
  return this.save();
};

// Static methods
listeningHistorySchema.statics.getUserRecentTracks = function(userId, limit = 50) {
  return this.find({ userId })
    .sort({ playedAt: -1 })
    .limit(limit)
    .populate('songId')
    .populate('playlistId', 'name type');
};

listeningHistorySchema.statics.getUserTopTracks = function(userId, timeRange = 30, limit = 20) {
  const startDate = new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        playedAt: { $gte: startDate },
        'interaction.completed': true
      }
    },
    {
      $group: {
        _id: '$songId',
        playCount: { $sum: 1 },
        totalDuration: { $sum: '$interaction.duration' },
        avgDuration: { $avg: '$interaction.duration' },
        lastPlayed: { $max: '$playedAt' }
      }
    },
    {
      $sort: { playCount: -1, totalDuration: -1 }
    },
    {
      $limit: limit
    },
    {
      $lookup: {
        from: 'songs',
        localField: '_id',
        foreignField: '_id',
        as: 'song'
      }
    }
  ]);
};

listeningHistorySchema.statics.getListeningPatterns = function(userId, days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        playedAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          timeOfDay: '$context.timeOfDay',
          weather: '$context.weather'
        },
        count: { $sum: 1 },
        avgDuration: { $avg: '$interaction.duration' },
        completionRate: {
          $avg: {
            $cond: ['$interaction.completed', 1, 0]
          }
        }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
};

listeningHistorySchema.statics.getSkipPatterns = function(userId, days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        playedAt: { $gte: startDate },
        'interaction.skipped': true
      }
    },
    {
      $group: {
        _id: '$interaction.skipReason',
        count: { $sum: 1 }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
};

module.exports = mongoose.model('ListeningHistory', listeningHistorySchema);