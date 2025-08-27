const mongoose = require('mongoose');

const playlistSchema = new mongoose.Schema({
  playlistId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  spotifyPlaylistId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: String,
  type: {
    type: String,
    enum: ['generated', 'curated', 'user_created'],
    default: 'generated'
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  context: {
    timeOfDay: {
      type: String,
      enum: ['morning', 'afternoon', 'evening', 'night']
    },
    weather: {
      type: String,
      enum: ['sunny', 'cloudy', 'rainy', 'stormy', 'snow']
    },
    temperature: Number,
    location: {
      city: String,
      country: String,
      coordinates: {
        lat: Number,
        lng: Number
      }
    },
    season: {
      type: String,
      enum: ['spring', 'summer', 'autumn', 'winter']
    }
  },
  tracks: [{
    songId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Song',
      required: true
    },
    spotifyTrackId: {
      type: String,
      required: true
    },
    position: {
      type: Number,
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  totalDuration: Number,
  trackCount: {
    type: Number,
    default: 0
  },
  stats: {
    plays: { type: Number, default: 0 },
    skips: { type: Number, default: 0 },
    saves: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    avgListenDuration: { type: Number, default: 0 }
  },
  tags: [String],
  image: String,
  spotifyUrl: String,
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
playlistSchema.index({ createdBy: 1, createdAt: -1 });
playlistSchema.index({ 'context.timeOfDay': 1 });
playlistSchema.index({ 'context.weather': 1 });
playlistSchema.index({ 'context.location.city': 1 });
playlistSchema.index({ type: 1 });
playlistSchema.index({ tags: 1 });

// Virtual for completion rate
playlistSchema.virtual('completionRate').get(function() {
  if (this.stats.plays === 0) return 0;
  return ((this.stats.plays - this.stats.skips) / this.stats.plays) * 100;
});

// Methods
playlistSchema.methods.updateStats = function(event, data) {
  switch (event) {
    case 'play':
      this.stats.plays += 1;
      break;
    case 'skip':
      this.stats.skips += 1;
      break;
    case 'save':
      this.stats.saves += 1;
      break;
    case 'share':
      this.stats.shares += 1;
      break;
    case 'listen_duration':
      this.stats.avgListenDuration = 
        (this.stats.avgListenDuration + data.duration) / 2;
      break;
  }
  return this.save();
};

playlistSchema.methods.addTrack = function(songId, spotifyTrackId) {
  const position = this.tracks.length;
  this.tracks.push({
    songId,
    spotifyTrackId,
    position
  });
  this.trackCount = this.tracks.length;
  return this.save();
};

playlistSchema.methods.removeTrack = function(position) {
  this.tracks = this.tracks.filter(track => track.position !== position);
  // Reorder positions
  this.tracks.forEach((track, index) => {
    track.position = index;
  });
  this.trackCount = this.tracks.length;
  return this.save();
};

// Static methods
playlistSchema.statics.findByContext = function(context) {
  const query = {};
  if (context.timeOfDay) query['context.timeOfDay'] = context.timeOfDay;
  if (context.weather) query['context.weather'] = context.weather;
  if (context.location?.city) query['context.location.city'] = context.location.city;
  
  return this.find(query);
};

playlistSchema.statics.findPopular = function(limit = 10) {
  return this.find({ isActive: true })
    .sort({ 'stats.plays': -1, 'stats.saves': -1 })
    .limit(limit);
};

playlistSchema.statics.findByUser = function(userId, limit = 20) {
  return this.find({ createdBy: userId, isActive: true })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('createdBy', 'displayName email');
};

module.exports = mongoose.model('Playlist', playlistSchema);