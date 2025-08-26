const mongoose = require('mongoose');

const songSchema = new mongoose.Schema({
  songId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  spotifyId: {
    type: String,
    required: true,
    unique: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  artist: {
    type: String,
    required: true,
    trim: true
  },
  album: {
    type: String,
    trim: true
  },
  artists: [{
    id: String,
    name: String,
    uri: String
  }],
  genres: [String],
  audioFeatures: {
    danceability: { type: Number, min: 0, max: 1 },
    energy: { type: Number, min: 0, max: 1 },
    key: { type: Number, min: 0, max: 11 },
    loudness: Number,
    mode: { type: Number, enum: [0, 1] },
    speechiness: { type: Number, min: 0, max: 1 },
    acousticness: { type: Number, min: 0, max: 1 },
    instrumentalness: { type: Number, min: 0, max: 1 },
    liveness: { type: Number, min: 0, max: 1 },
    valence: { type: Number, min: 0, max: 1 },
    tempo: { type: Number, min: 0 },
    timeSignature: { type: Number, min: 3, max: 7 },
    duration: Number
  },
  moodTags: [{
    type: String,
    enum: [
      'happy', 'sad', 'energetic', 'calm', 'romantic', 'aggressive',
      'melancholic', 'uplifting', 'chill', 'focus', 'workout', 'party',
      'relaxing', 'nostalgic', 'dramatic', 'peaceful'
    ]
  }],
  contextTags: [{
    type: String,
    enum: [
      'morning', 'afternoon', 'evening', 'night', 'rainy', 'sunny',
      'cloudy', 'hot', 'cold', 'warm', 'cool', 'urban', 'nature',
      'commute', 'work', 'study', 'sleep'
    ]
  }],
  popularity: {
    type: Number,
    min: 0,
    max: 100
  },
  releaseYear: Number,
  durationMs: {
    type: Number,
    required: true
  },
  explicit: {
    type: Boolean,
    default: false
  },
  previewUrl: String,
  externalUrls: {
    spotify: String
  },
  isrc: String,
  markets: [String]
}, {
  timestamps: true
});

// Indexes
songSchema.index({ spotifyId: 1 });
songSchema.index({ artist: 1 });
songSchema.index({ genres: 1 });
songSchema.index({ moodTags: 1 });
songSchema.index({ contextTags: 1 });
songSchema.index({ popularity: -1 });
songSchema.index({ 'audioFeatures.valence': 1 });
songSchema.index({ 'audioFeatures.energy': 1 });
songSchema.index({ 'audioFeatures.danceability': 1 });

// Methods
songSchema.methods.getMoodScore = function() {
  const features = this.audioFeatures;
  if (!features) return 0.5;
  
  // Calculate mood score based on valence, energy, and danceability
  return (features.valence * 0.4 + features.energy * 0.3 + features.danceability * 0.3);
};

songSchema.methods.getEnergyLevel = function() {
  const energy = this.audioFeatures?.energy || 0.5;
  if (energy > 0.8) return 'high';
  if (energy > 0.5) return 'medium';
  return 'low';
};

// Static methods
songSchema.statics.findByGenres = function(genres) {
  return this.find({ genres: { $in: genres } });
};

songSchema.statics.findByMoodTags = function(tags) {
  return this.find({ moodTags: { $in: tags } });
};

songSchema.statics.findByContextTags = function(tags) {
  return this.find({ contextTags: { $in: tags } });
};

module.exports = mongoose.model('Song', songSchema);