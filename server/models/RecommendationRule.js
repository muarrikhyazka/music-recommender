const mongoose = require('mongoose');

const recommendationRuleSchema = new mongoose.Schema({
  ruleId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: String,
  conditions: {
    timeOfDay: {
      type: [String],
      enum: ['morning', 'afternoon', 'evening', 'night']
    },
    weather: {
      type: [String],
      enum: ['sunny', 'cloudy', 'partly_cloudy', 'rainy', 'stormy', 'snow', 'fog']
    },
    temperatureRange: {
      min: Number,
      max: Number
    },
    geoRegion: {
      countries: [String],
      cities: [String],
      continents: [String]
    },
    season: {
      type: [String],
      enum: ['spring', 'summer', 'autumn', 'winter']
    },
    mood: {
      type: [String],
      enum: ['happy', 'sad', 'energetic', 'calm', 'stressed', 'relaxed', 'focused', 'social']
    },
    activity: {
      type: [String],
      enum: ['stationary', 'walking', 'driving', 'commuting', 'working', 'exercising', 'sleeping']
    }
  },
  recommendations: {
    themes: [{
      name: { type: String, required: true },
      weight: { type: Number, default: 1.0, min: 0, max: 10 },
      description: String
    }],
    genres: [{
      name: { type: String, required: true },
      weight: { type: Number, default: 1.0, min: 0, max: 10 },
      subgenres: [String]
    }],
    audioFeatures: {
      valence: { min: Number, max: Number, target: Number, weight: Number },
      energy: { min: Number, max: Number, target: Number, weight: Number },
      danceability: { min: Number, max: Number, target: Number, weight: Number },
      acousticness: { min: Number, max: Number, target: Number, weight: Number },
      instrumentalness: { min: Number, max: Number, target: Number, weight: Number },
      tempo: { min: Number, max: Number, target: Number, weight: Number }
    },
    contextTags: [String],
    moodTags: [String],
    excludedGenres: [String],
    excludedMoodTags: [String]
  },
  priority: {
    type: Number,
    default: 1,
    min: 1,
    max: 10
  },
  isActive: {
    type: Boolean,
    default: true
  },
  applicableRegions: [String],
  culturalFactors: {
    localGenres: [String],
    popularityBoost: Number,
    languagePreference: [String]
  },
  effectiveness: {
    appliedCount: { type: Number, default: 0 },
    successRate: { type: Number, default: 0 },
    avgRating: { type: Number, default: 0 },
    lastApplied: Date
  }
}, {
  timestamps: true
});

// Indexes
recommendationRuleSchema.index({ 'conditions.timeOfDay': 1 });
recommendationRuleSchema.index({ 'conditions.weather': 1 });
recommendationRuleSchema.index({ 'conditions.geoRegion.countries': 1 });
recommendationRuleSchema.index({ 'conditions.season': 1 });
recommendationRuleSchema.index({ priority: -1, isActive: 1 });
recommendationRuleSchema.index({ 'effectiveness.successRate': -1 });

// Methods
recommendationRuleSchema.methods.matches = function(context) {
  const conditions = this.conditions;
  
  // Check time of day
  if (conditions.timeOfDay && conditions.timeOfDay.length > 0) {
    if (!conditions.timeOfDay.includes(context.timeOfDay)) {
      return false;
    }
  }
  
  // Check weather
  if (conditions.weather && conditions.weather.length > 0) {
    if (!conditions.weather.includes(context.weather?.condition)) {
      return false;
    }
  }
  
  // Check temperature range
  if (conditions.temperatureRange && context.weather?.temperature) {
    const temp = context.weather.temperature;
    if (conditions.temperatureRange.min && temp < conditions.temperatureRange.min) {
      return false;
    }
    if (conditions.temperatureRange.max && temp > conditions.temperatureRange.max) {
      return false;
    }
  }
  
  // Check geographic region
  if (conditions.geoRegion && context.geoLocation) {
    const { countries, cities } = conditions.geoRegion;
    const userCountry = context.geoLocation.country;
    const userCity = context.geoLocation.city;
    
    if (countries && countries.length > 0 && !countries.includes(userCountry)) {
      return false;
    }
    
    if (cities && cities.length > 0 && !cities.includes(userCity)) {
      return false;
    }
  }
  
  // Check season
  if (conditions.season && conditions.season.length > 0) {
    if (!conditions.season.includes(context.season)) {
      return false;
    }
  }
  
  // Check mood
  if (conditions.mood && conditions.mood.length > 0 && context.moodDetected) {
    if (!conditions.mood.includes(context.moodDetected.primary)) {
      return false;
    }
  }
  
  // Check activity
  if (conditions.activity && conditions.activity.length > 0 && context.activityContext) {
    if (!conditions.activity.includes(context.activityContext.detectedActivity)) {
      return false;
    }
  }
  
  return true;
};

recommendationRuleSchema.methods.getMatchScore = function(context) {
  if (!this.matches(context)) return 0;
  
  let score = this.priority;
  
  // Boost score based on specific matches
  if (this.conditions.timeOfDay?.includes(context.timeOfDay)) {
    score += 0.5;
  }
  
  if (this.conditions.weather?.includes(context.weather?.condition)) {
    score += 0.5;
  }
  
  if (this.conditions.mood?.includes(context.moodDetected?.primary)) {
    score += 0.3;
  }
  
  // Factor in effectiveness
  score *= (1 + (this.effectiveness.successRate || 0));
  
  return score;
};

recommendationRuleSchema.methods.updateEffectiveness = function(applied = true, success = false, rating = null) {
  if (applied) {
    this.effectiveness.appliedCount += 1;
    this.effectiveness.lastApplied = new Date();
  }
  
  if (success !== null) {
    const currentRate = this.effectiveness.successRate || 0;
    const count = this.effectiveness.appliedCount;
    this.effectiveness.successRate = ((currentRate * (count - 1)) + (success ? 1 : 0)) / count;
  }
  
  if (rating !== null) {
    const currentRating = this.effectiveness.avgRating || 0;
    const count = this.effectiveness.appliedCount;
    this.effectiveness.avgRating = ((currentRating * (count - 1)) + rating) / count;
  }
  
  return this.save();
};

// Static methods
recommendationRuleSchema.statics.findMatchingRules = function(context, limit = 10) {
  return this.find({ isActive: true })
    .sort({ priority: -1, 'effectiveness.successRate': -1 })
    .limit(limit * 2) // Get more rules to filter
    .then(rules => {
      // Filter and score rules
      const scoredRules = rules
        .map(rule => ({
          rule,
          score: rule.getMatchScore(context)
        }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(item => item.rule);
      
      return scoredRules;
    });
};

recommendationRuleSchema.statics.getPopularRules = function(region = null, limit = 20) {
  const query = { isActive: true };
  if (region) {
    query.$or = [
      { 'conditions.geoRegion.countries': region },
      { applicableRegions: region },
      { applicableRegions: { $exists: false } }
    ];
  }
  
  return this.find(query)
    .sort({ 
      'effectiveness.successRate': -1, 
      'effectiveness.appliedCount': -1,
      priority: -1 
    })
    .limit(limit);
};

recommendationRuleSchema.statics.createDefaultRules = async function() {
  const defaultRules = [
    {
      ruleId: 'morning_sunny_energetic',
      name: 'Morning Sunny Energy',
      description: 'Upbeat music for sunny mornings',
      conditions: {
        timeOfDay: ['morning'],
        weather: ['sunny', 'partly_cloudy'],
        temperatureRange: { min: 15, max: 35 }
      },
      recommendations: {
        themes: [
          { name: 'energetic_start', weight: 3.0 },
          { name: 'uplifting_pop', weight: 2.5 }
        ],
        genres: [
          { name: 'pop', weight: 2.5 },
          { name: 'indie_rock', weight: 2.0 },
          { name: 'electronic', weight: 1.5 }
        ],
        audioFeatures: {
          energy: { min: 0.6, max: 1.0, target: 0.8, weight: 2.0 },
          valence: { min: 0.5, max: 1.0, target: 0.7, weight: 1.5 },
          danceability: { min: 0.4, max: 1.0, target: 0.6, weight: 1.0 }
        },
        moodTags: ['happy', 'energetic', 'uplifting'],
        contextTags: ['morning', 'sunny', 'energetic']
      },
      priority: 8
    },
    {
      ruleId: 'evening_rainy_chill',
      name: 'Rainy Evening Chill',
      description: 'Relaxing music for rainy evenings',
      conditions: {
        timeOfDay: ['evening', 'night'],
        weather: ['rainy', 'stormy', 'cloudy']
      },
      recommendations: {
        themes: [
          { name: 'rainy_night_lofi', weight: 3.0 },
          { name: 'acoustic_chill', weight: 2.5 }
        ],
        genres: [
          { name: 'lofi', weight: 3.0 },
          { name: 'acoustic', weight: 2.5 },
          { name: 'jazz', weight: 2.0 },
          { name: 'r&b', weight: 1.5 }
        ],
        audioFeatures: {
          energy: { min: 0.1, max: 0.5, target: 0.3, weight: 2.0 },
          valence: { min: 0.2, max: 0.7, target: 0.4, weight: 1.0 },
          acousticness: { min: 0.5, max: 1.0, target: 0.8, weight: 1.5 }
        },
        moodTags: ['chill', 'relaxing', 'melancholic', 'peaceful'],
        contextTags: ['evening', 'night', 'rainy', 'chill']
      },
      priority: 9
    }
  ];
  
  for (const rule of defaultRules) {
    await this.findOneAndUpdate(
      { ruleId: rule.ruleId },
      rule,
      { upsert: true, new: true }
    );
  }
};

module.exports = mongoose.model('RecommendationRule', recommendationRuleSchema);