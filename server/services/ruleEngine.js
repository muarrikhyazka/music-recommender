const RecommendationRule = require('../models/RecommendationRule');
const logger = require('../utils/logger');
const NodeCache = require('node-cache');

class RuleEngine {
  constructor() {
    // Cache rules for 30 minutes
    this.cache = new NodeCache({ stdTTL: 1800 });
    this.rulesCache = new NodeCache({ stdTTL: 3600 }); // 1 hour for rules
  }

  /**
   * Get candidate tracks based on context and rules
   */
  async getCandidates(context, userProfile = {}) {
    try {
      const startTime = Date.now();
      
      // Get matching rules for the context
      const matchingRules = await this.getMatchingRules(context);
      
      if (matchingRules.length === 0) {
        logger.warn('No matching rules found for context', { context });
        return this.getFallbackCandidates(context, userProfile);
      }

      // Combine recommendations from all matching rules
      const candidates = this.combineRuleRecommendations(matchingRules, context, userProfile);
      
      const processingTime = Date.now() - startTime;
      logger.info('Rule engine generated candidates', {
        contextId: context.contextId,
        rulesMatched: matchingRules.length,
        candidatesCount: candidates.length,
        processingTime
      });

      return {
        candidates,
        appliedRules: matchingRules.map(rule => ({
          ruleId: rule.ruleId,
          name: rule.name,
          weight: rule.priority,
          matchScore: rule.getMatchScore(context)
        })),
        processingTime
      };

    } catch (error) {
      logger.error('Error in rule engine getCandidates:', error);
      return this.getFallbackCandidates(context, userProfile);
    }
  }

  /**
   * Find rules that match the given context
   */
  async getMatchingRules(context, limit = 10) {
    try {
      const cacheKey = `rules_${this.getContextFingerprint(context)}`;
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const matchingRules = await RecommendationRule.findMatchingRules(context, limit);
      
      // Cache the results
      this.cache.set(cacheKey, matchingRules);
      
      return matchingRules;
    } catch (error) {
      logger.error('Error finding matching rules:', error);
      return [];
    }
  }

  /**
   * Combine recommendations from multiple rules
   */
  combineRuleRecommendations(rules, context, userProfile) {
    const combined = {
      themes: new Map(),
      genres: new Map(),
      audioFeatures: {},
      contextTags: new Set(),
      moodTags: new Set(),
      excludedGenres: new Set(),
      excludedMoodTags: new Set()
    };

    let totalWeight = 0;

    // Process each rule
    for (const rule of rules) {
      const weight = rule.priority * rule.getMatchScore(context);
      totalWeight += weight;

      // Combine themes
      if (rule.recommendations.themes) {
        for (const theme of rule.recommendations.themes) {
          const currentWeight = combined.themes.get(theme.name) || 0;
          combined.themes.set(theme.name, currentWeight + (theme.weight * weight));
        }
      }

      // Combine genres
      if (rule.recommendations.genres) {
        for (const genre of rule.recommendations.genres) {
          const currentWeight = combined.genres.get(genre.name) || 0;
          combined.genres.set(genre.name, currentWeight + (genre.weight * weight));
        }
      }

      // Combine audio features
      this.combineAudioFeatures(combined.audioFeatures, rule.recommendations.audioFeatures, weight);

      // Combine tags
      if (rule.recommendations.contextTags) {
        rule.recommendations.contextTags.forEach(tag => combined.contextTags.add(tag));
      }
      if (rule.recommendations.moodTags) {
        rule.recommendations.moodTags.forEach(tag => combined.moodTags.add(tag));
      }

      // Combine exclusions
      if (rule.recommendations.excludedGenres) {
        rule.recommendations.excludedGenres.forEach(genre => combined.excludedGenres.add(genre));
      }
      if (rule.recommendations.excludedMoodTags) {
        rule.recommendations.excludedMoodTags.forEach(tag => combined.excludedMoodTags.add(tag));
      }
    }

    // Normalize weights
    this.normalizeWeights(combined, totalWeight);

    // Convert to candidate format
    return this.formatCandidates(combined, context, userProfile);
  }

  /**
   * Combine audio features from multiple rules
   */
  combineAudioFeatures(target, source, weight) {
    if (!source) return;

    const features = ['valence', 'energy', 'danceability', 'acousticness', 'instrumentalness', 'tempo'];
    
    for (const feature of features) {
      if (source[feature]) {
        if (!target[feature]) {
          target[feature] = { min: 0, max: 1, target: 0.5, weight: 0 };
        }

        const sourceFeature = source[feature];
        const targetFeature = target[feature];

        // Weighted average for target values
        if (sourceFeature.target !== undefined) {
          const totalWeight = targetFeature.weight + (sourceFeature.weight || 1) * weight;
          const weightedTarget = 
            (targetFeature.target * targetFeature.weight + 
             sourceFeature.target * (sourceFeature.weight || 1) * weight) / totalWeight;
          
          targetFeature.target = weightedTarget;
          targetFeature.weight = totalWeight;
        }

        // Min/max constraints
        if (sourceFeature.min !== undefined) {
          targetFeature.min = Math.max(targetFeature.min, sourceFeature.min);
        }
        if (sourceFeature.max !== undefined) {
          targetFeature.max = Math.min(targetFeature.max, sourceFeature.max);
        }
      }
    }
  }

  /**
   * Normalize weights in the combined recommendations
   */
  normalizeWeights(combined, totalWeight) {
    if (totalWeight === 0) return;

    // Normalize theme weights
    for (const [theme, weight] of combined.themes) {
      combined.themes.set(theme, weight / totalWeight);
    }

    // Normalize genre weights
    for (const [genre, weight] of combined.genres) {
      combined.genres.set(genre, weight / totalWeight);
    }
  }

  /**
   * Format combined recommendations into candidate structure
   */
  formatCandidates(combined, context, userProfile) {
    const candidates = {
      themes: Array.from(combined.themes.entries())
        .map(([name, weight]) => ({ name, weight }))
        .sort((a, b) => b.weight - a.weight),
      
      genres: Array.from(combined.genres.entries())
        .map(([name, weight]) => ({ name, weight }))
        .sort((a, b) => b.weight - a.weight),
      
      audioFeatures: combined.audioFeatures,
      contextTags: Array.from(combined.contextTags),
      moodTags: Array.from(combined.moodTags),
      excludedGenres: Array.from(combined.excludedGenres),
      excludedMoodTags: Array.from(combined.excludedMoodTags),
      
      // Add user preferences boost
      userGenres: this.getUserGenreBoosts(userProfile),
      userArtists: this.getUserArtistBoosts(userProfile),
      
      // Context metadata
      contextFingerprint: this.getContextFingerprint(context),
      timestamp: Date.now()
    };

    return candidates;
  }

  /**
   * Get user genre preferences boost
   */
  getUserGenreBoosts(userProfile) {
    if (!userProfile.topGenres) return [];
    
    return userProfile.topGenres.map((genre, index) => ({
      genre: genre.name || genre,
      boost: Math.max(0.1, 1.0 - (index * 0.1)) // Decreasing boost
    }));
  }

  /**
   * Get user artist preferences boost
   */
  getUserArtistBoosts(userProfile) {
    if (!userProfile.topArtists) return [];
    
    return userProfile.topArtists.slice(0, 10).map((artist, index) => ({
      artist: artist.name || artist,
      boost: Math.max(0.05, 0.5 - (index * 0.05)) // Smaller boost than genres
    }));
  }

  /**
   * Get fallback candidates when no rules match
   */
  getFallbackCandidates(context, userProfile) {
    const fallbackGenres = this.getFallbackGenres(context);
    
    return {
      candidates: {
        themes: [{ name: 'general', weight: 1.0 }],
        genres: fallbackGenres.map(genre => ({ name: genre, weight: 1.0 / fallbackGenres.length })),
        audioFeatures: this.getDefaultAudioFeatures(context),
        contextTags: [context.timeOfDay, context.weather?.condition].filter(Boolean),
        moodTags: ['general'],
        excludedGenres: [],
        excludedMoodTags: [],
        userGenres: this.getUserGenreBoosts(userProfile),
        userArtists: this.getUserArtistBoosts(userProfile),
        contextFingerprint: this.getContextFingerprint(context),
        timestamp: Date.now()
      },
      appliedRules: [{
        ruleId: 'fallback',
        name: 'Fallback Rule',
        weight: 1.0,
        matchScore: 0.5
      }],
      processingTime: 0
    };
  }

  /**
   * Get fallback genres based on time and weather
   */
  getFallbackGenres(context) {
    const { timeOfDay, weather } = context;
    
    // Basic genre mapping for common scenarios
    if (timeOfDay === 'morning') {
      return ['pop', 'indie', 'electronic'];
    } else if (timeOfDay === 'evening' || timeOfDay === 'night') {
      if (weather?.condition === 'rainy') {
        return ['jazz', 'acoustic', 'r&b'];
      }
      return ['alternative', 'indie', 'electronic'];
    } else if (weather?.condition === 'sunny') {
      return ['pop', 'indie', 'reggae'];
    }
    
    return ['pop', 'indie', 'alternative']; // Default genres
  }

  /**
   * Get default audio features based on context
   */
  getDefaultAudioFeatures(context) {
    const { timeOfDay, weather } = context;
    
    // Default audio feature ranges
    const defaults = {
      valence: { min: 0.3, max: 0.8, target: 0.5, weight: 1.0 },
      energy: { min: 0.3, max: 0.8, target: 0.5, weight: 1.0 },
      danceability: { min: 0.2, max: 0.8, target: 0.5, weight: 0.5 }
    };

    // Adjust based on time
    if (timeOfDay === 'morning') {
      defaults.energy.target = 0.7;
      defaults.valence.target = 0.7;
    } else if (timeOfDay === 'night') {
      defaults.energy.target = 0.3;
      defaults.valence.target = 0.4;
    }

    // Adjust based on weather
    if (weather?.condition === 'rainy') {
      defaults.valence.target = 0.3;
      defaults.energy.target = 0.3;
    } else if (weather?.condition === 'sunny') {
      defaults.valence.target = 0.8;
      defaults.energy.target = 0.7;
    }

    return defaults;
  }

  /**
   * Create a context fingerprint for caching
   */
  getContextFingerprint(context) {
    const parts = [
      context.timeOfDay || 'unknown',
      context.weather?.condition || 'unknown',
      Math.round((context.weather?.temperature || 20) / 5) * 5, // Round to nearest 5
      context.geoLocation?.city || 'unknown',
      context.season || 'unknown'
    ];
    
    return parts.join('_');
  }

  /**
   * Update rule effectiveness based on recommendation results
   */
  async updateRuleEffectiveness(ruleId, applied = true, success = false, rating = null) {
    try {
      const rule = await RecommendationRule.findOne({ ruleId });
      if (rule) {
        await rule.updateEffectiveness(applied, success, rating);
        logger.debug('Rule effectiveness updated', { ruleId, success, rating });
      }
    } catch (error) {
      logger.error('Error updating rule effectiveness:', error);
    }
  }

  /**
   * Get rule performance analytics
   */
  async getRulePerformance(days = 30) {
    try {
      const rules = await RecommendationRule.find({ isActive: true })
        .sort({ 'effectiveness.successRate': -1, 'effectiveness.appliedCount': -1 })
        .select('ruleId name effectiveness priority')
        .limit(50);

      return rules.map(rule => ({
        ruleId: rule.ruleId,
        name: rule.name,
        priority: rule.priority,
        appliedCount: rule.effectiveness.appliedCount || 0,
        successRate: rule.effectiveness.successRate || 0,
        avgRating: rule.effectiveness.avgRating || 0,
        lastApplied: rule.effectiveness.lastApplied,
        score: (rule.effectiveness.successRate || 0) * (rule.effectiveness.appliedCount || 0)
      }));
    } catch (error) {
      logger.error('Error getting rule performance:', error);
      return [];
    }
  }

  /**
   * Initialize default rules if none exist
   */
  async initializeDefaultRules() {
    try {
      const existingRules = await RecommendationRule.countDocuments();
      if (existingRules === 0) {
        logger.info('No rules found, creating default rules');
        await RecommendationRule.createDefaultRules();
        logger.info('Default rules created successfully');
      }
    } catch (error) {
      logger.error('Error initializing default rules:', error);
    }
  }

  /**
   * Clear caches
   */
  clearCache() {
    this.cache.flushAll();
    this.rulesCache.flushAll();
    logger.info('Rule engine caches cleared');
  }
}

module.exports = new RuleEngine();