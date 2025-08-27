const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  spotifyId: {
    type: String,
    required: true,
    unique: true
  },
  displayName: {
    type: String,
    required: true
  },
  spotifyProfile: {
    country: String,
    followers: Number,
    images: [{ url: String, height: Number, width: Number }],
    product: String
  },
  preferences: {
    autoCreatePlaylists: {
      type: Boolean,
      default: true
    },
    enableLocationTracking: {
      type: Boolean,
      default: true
    },
    defaultRegion: String,
    language: {
      type: String,
      default: 'en'
    }
  },
  tokens: {
    accessToken: {
      type: String,
      required: true,
      select: false
    },
    refreshToken: {
      type: String,
      required: true,
      select: false
    },
    expiresAt: {
      type: Date,
      required: true
    }
  },
  locationDefault: {
    city: String,
    country: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
userSchema.index({ createdAt: -1 });

// Methods
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.tokens;
  return user;
};

userSchema.methods.isTokenExpired = function() {
  return new Date() >= this.tokens.expiresAt;
};

// Static methods
userSchema.statics.findBySpotifyId = function(spotifyId) {
  return this.findOne({ spotifyId });
};

userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

module.exports = mongoose.model('User', userSchema);