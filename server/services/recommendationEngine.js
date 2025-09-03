const ruleEngine = require('./ruleEngine');
const spotifyService = require('./spotifyService');
const contextService = require('./contextService');
const logger = require('../utils/logger');
const Song = require('../models/Song');
const User = require('../models/User');
const ListeningHistory = require('../models/ListeningHistory');
const RecommendationLog = require('../models/RecommendationLog');
const { v4: uuidv4 } = require('crypto');

class RecommendationEngine {
  constructor() {
    this.version = '1.0';
    this.modelType = 'hybrid_rule_based';
  }

  /**
   * Generate recommendations for a user based on context
   */
  async generateRecommendations(userId, context, options = {}) {
    const startTime = Date.now();
    const recId = uuidv4();
    
    try {
      logger.info('Starting recommendation generation', { userId, recId, context });

      // Get user profile and listening history
      const user = await User.findById(userId).select('+tokens');
      if (!user) {
        throw new Error('User not found');
      }

      const accessToken = await spotifyService.ensureValidToken(user);
      const userProfile = await this.buildUserProfile(user, accessToken);

      // Generate two-part recommendations
      const twoPartRecommendations = await this.generateTwoPartRecommendations(
        accessToken,
        context,
        userProfile,
        options
      );

      const processingTime = Date.now() - startTime;

      // Log recommendation
      const logData = {
        recId,
        userId,
        contextId: context.contextId,
        deliveredAt: new Date(),
        recommendationType: 'two_part_hybrid',
        algorithm: {
          version: this.version,
          model: this.modelType,
          confidence: this.calculateTwoPartConfidence(twoPartRecommendations),
          processingTime
        },
        input: {
          context: {
            timeOfDay: context.timeOfDay,
            weather: context.weather?.condition,
            temperature: context.weather?.temperature,
            location: context.geoLocation?.city,
            mood: context.moodDetected?.primary,
            activity: context.activityContext?.detectedActivity
          },
          userProfile: {
            topGenres: userProfile.topGenres?.map(g => g.name).slice(0, 5) || [],
            topArtists: userProfile.topArtists?.map(a => a.name).slice(0, 5) || [],
            recentTracks: userProfile.recentTracks?.map(t => t.name).slice(0, 10) || [],
            listeningPatterns: userProfile.patterns
          }
        },
        output: {
          fromUserPlaylists: (twoPartRecommendations.fromUserPlaylists || []).map((track, index) => ({
            spotifyTrackId: track.id,
            title: track.name,
            artist: track.artists[0]?.name,
            score: track.score || 0,
            reasons: track.reasons || [],
            position: index
          })),
          fromGlobalRecommendations: (twoPartRecommendations.fromGlobalRecommendations || []).map((track, index) => ({
            spotifyTrackId: track.id,
            title: track.name,
            artist: track.artists[0]?.name,
            score: track.score || 0,
            reasons: track.reasons || [],
            position: index
          })),
          playlistName: this.generatePlaylistName(context),
          playlistDescription: this.generatePlaylistDescription(context, twoPartRecommendations.combined || []),
          totalUserTracks: twoPartRecommendations.fromUserPlaylists?.length || 0,
          totalGlobalTracks: twoPartRecommendations.fromGlobalRecommendations?.length || 0,
          diversity: this.calculateDiversity(twoPartRecommendations.combined || [])
        }
      };

      await this.logRecommendation(logData);

      logger.info('Two-part recommendation generation completed', {
        userId,
        recId,
        userTracksCount: twoPartRecommendations.fromUserPlaylists?.length || 0,
        globalTracksCount: twoPartRecommendations.fromGlobalRecommendations?.length || 0,
        processingTime
      });

      return {
        fromUserPlaylists: twoPartRecommendations.fromUserPlaylists,
        fromGlobalRecommendations: twoPartRecommendations.fromGlobalRecommendations,
        metadata: {
          recId,
          processingTime,
          confidence: logData.algorithm.confidence,
          playlistName: logData.output.playlistName,
          playlistDescription: logData.output.playlistDescription,
          diversity: logData.output.diversity
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Error generating recommendations:', error);
      
      // Log error
      await this.logRecommendation({
        recId,
        userId,
        contextId: context.contextId,
        deliveredAt: new Date(),
        recommendationType: 'fallback',
        algorithm: {
          version: this.version,
          processingTime
        },
        errors: [{
          type: error.name || 'UnknownError',
          message: error.message,
          timestamp: new Date()
        }]
      }).catch(logError => {
        logger.error('Failed to log error recommendation:', logError);
      });

      // No fallback recommendations - throw error for production
      throw new Error('Failed to generate recommendations - service unavailable');
    }
  }

  /**
   * Build comprehensive user profile from Spotify data and listening history
   */
  async buildUserProfile(user, accessToken) {
    try {
      const [topTracks, topArtists, recentTracks, listeningHistory] = await Promise.all([
        spotifyService.getUserTopTracks(accessToken, 'medium_term', 30).catch(() => []),
        spotifyService.getUserTopArtists(accessToken, 'medium_term', 30).catch(() => []),
        spotifyService.getRecentlyPlayed(accessToken, 30).catch(() => []),
        ListeningHistory.getUserRecentTracks(user._id, 50).catch(() => [])
      ]);

      // Extract genres from top artists
      const genreFreq = new Map();
      topArtists.forEach(artist => {
        artist.genres.forEach(genre => {
          genreFreq.set(genre, (genreFreq.get(genre) || 0) + 1);
        });
      });

      const topGenres = Array.from(genreFreq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([genre, count]) => ({ name: genre, frequency: count }));

      // Get audio feature preferences
      const trackIds = topTracks.map(track => track.id).slice(0, 20);
      let audioFeaturePrefs = {};
      
      if (trackIds.length > 0) {
        const audioFeatures = await spotifyService.getAudioFeatures(accessToken, trackIds).catch(() => []);
        audioFeaturePrefs = this.calculateAudioFeaturePreferences(audioFeatures);
      }

      // Get listening patterns from history
      const patterns = await ListeningHistory.getListeningPatterns(user._id, 30).catch(() => []);

      return {
        spotifyId: user.spotifyId,
        topTracks: topTracks.slice(0, 20),
        topArtists: topArtists.slice(0, 15),
        topGenres,
        recentTracks: recentTracks.map(item => item.track).slice(0, 20),
        audioFeaturePrefs,
        patterns,
        listeningHistory: listeningHistory.slice(0, 30),
        preferences: user.preferences || {}
      };
    } catch (error) {
      logger.error('Error building user profile:', error);
      return {
        spotifyId: user.spotifyId,
        topTracks: [],
        topArtists: [],
        topGenres: [],
        recentTracks: [],
        audioFeaturePrefs: {},
        patterns: [],
        preferences: user.preferences || {}
      };
    }
  }

  /**
   * Calculate user's audio feature preferences from listening history
   */
  calculateAudioFeaturePreferences(audioFeatures) {
    if (audioFeatures.length === 0) return {};

    const features = ['valence', 'energy', 'danceability', 'acousticness', 'instrumentalness', 'tempo'];
    const prefs = {};

    for (const feature of features) {
      const values = audioFeatures
        .filter(f => f[feature] !== undefined)
        .map(f => f[feature]);

      if (values.length > 0) {
        prefs[feature] = {
          mean: values.reduce((a, b) => a + b, 0) / values.length,
          std: Math.sqrt(values.reduce((a, b) => a + Math.pow(b - prefs[feature]?.mean || 0, 2), 0) / values.length),
          min: Math.min(...values),
          max: Math.max(...values)
        };
      }
    }

    return prefs;
  }

  /**
   * Fetch candidate tracks from Spotify based on rule candidates
   */
  async fetchCandidateTracks(accessToken, candidates, targetLength) {
    try {
      const tracks = [];
      const seedGenres = candidates.genres.slice(0, 3).map(g => g.name);
      const seedArtists = candidates.userArtists.slice(0, 2).map(a => a.artist);
      
      // Get tracks using Spotify recommendations
      if (seedGenres.length > 0 || seedArtists.length > 0) {
        const spotifyRecommendations = await spotifyService.getRecommendations(accessToken, {
          limit: Math.min(targetLength * 2, 100), // Get more than needed for filtering
          seedGenres: seedGenres.slice(0, 3), // Max 3 genres
          seedArtists: seedArtists.slice(0, 2), // Max 2 artists
          audioFeatures: candidates.audioFeatures
        });

        tracks.push(...spotifyRecommendations);
      }

      // If we don't have enough tracks, search by theme/mood
      if (tracks.length < targetLength && candidates.themes.length > 0) {
        const theme = candidates.themes[0].name;
        const searchQuery = `genre:${seedGenres[0] || 'pop'} ${theme}`;
        
        const searchResults = await spotifyService.searchTracks(accessToken, searchQuery, {
          limit: targetLength
        });

        tracks.push(...searchResults);
      }

      // Remove duplicates
      const uniqueTracks = tracks.filter((track, index, self) => 
        index === self.findIndex(t => t.id === track.id)
      );

      return uniqueTracks.slice(0, targetLength * 3); // Return extra for ranking
    } catch (error) {
      logger.error('Error fetching candidate tracks:', error);
      return [];
    }
  }

  /**
   * Rank tracks using ML-inspired scoring
   */
  async rankTracks(tracks, context, userProfile, candidates) {
    try {
      const rankedTracks = tracks.map(track => {
        let score = 0;
        const reasons = [];

        // Context matching score (40% weight)
        const contextScore = this.calculateContextScore(track, context, candidates);
        score += contextScore * 0.4;
        if (contextScore > 0.7) reasons.push('Great context match');

        // User preference score (35% weight)
        const preferenceScore = this.calculatePreferenceScore(track, userProfile);
        score += preferenceScore * 0.35;
        if (preferenceScore > 0.7) reasons.push('Matches your taste');

        // Popularity and quality score (15% weight)
        const popularityScore = (track.popularity || 50) / 100;
        score += popularityScore * 0.15;

        // Novelty/discovery score (10% weight)
        const noveltyScore = this.calculateNoveltyScore(track, userProfile);
        score += noveltyScore * 0.1;
        if (noveltyScore > 0.8) reasons.push('New discovery');

        // Penalties
        if (this.isRecentlyPlayed(track, userProfile.recentTracks)) {
          score *= 0.7; // 30% penalty for recently played
        }

        if (track.explicit && userProfile.preferences?.avoidExplicit) {
          score *= 0.5; // 50% penalty for explicit content if user prefers clean
        }

        return {
          ...track,
          score: Math.max(0, Math.min(1, score)), // Clamp between 0 and 1
          reasons,
          contextScore,
          preferenceScore,
          popularityScore,
          noveltyScore
        };
      });

      return rankedTracks.sort((a, b) => b.score - a.score);
    } catch (error) {
      logger.error('Error ranking tracks:', error);
      return tracks.map(track => ({ ...track, score: 0.5, reasons: [] }));
    }
  }

  /**
   * Calculate how well a track matches the current context
   */
  calculateContextScore(track, context, candidates) {
    let score = 0;
    
    // Genre matching
    const trackGenres = this.inferTrackGenres(track, candidates.genres);
    if (trackGenres.length > 0) {
      const genreMatch = candidates.genres.find(g => 
        trackGenres.some(tg => tg.toLowerCase().includes(g.name.toLowerCase()))
      );
      if (genreMatch) score += genreMatch.weight * 0.3;
    }

    // Artist matching
    const artistMatch = candidates.userArtists.find(ua => 
      track.artists.some(artist => artist.name.toLowerCase() === ua.artist.toLowerCase())
    );
    if (artistMatch) score += artistMatch.boost * 0.4;

    // Mood/theme matching based on track name and context
    const moodMatch = this.calculateMoodMatch(track, context, candidates.moodTags);
    score += moodMatch * 0.3;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate how well a track matches user preferences
   */
  calculatePreferenceScore(track, userProfile) {
    let score = 0;

    // Artist preference
    const isTopArtist = userProfile.topArtists.some(artist => 
      track.artists.some(trackArtist => trackArtist.id === artist.id)
    );
    if (isTopArtist) score += 0.4;

    // Similar to top tracks (simplified)
    const nameWords = track.name.toLowerCase().split(' ');
    const topTrackWords = userProfile.topTracks
      .flatMap(t => t.name.toLowerCase().split(' '));
    
    const wordOverlap = nameWords.filter(word => 
      topTrackWords.includes(word) && word.length > 3
    ).length;
    
    if (wordOverlap > 0) score += Math.min(0.3, wordOverlap * 0.1);

    // Popularity preference (users generally prefer moderately popular tracks)
    const popularity = track.popularity || 50;
    if (popularity >= 30 && popularity <= 80) {
      score += 0.3;
    } else if (popularity > 80) {
      score += 0.2; // Slightly less boost for very popular tracks
    } else {
      score += 0.1; // Some boost for less popular tracks (discovery)
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate novelty score for discovery
   */
  calculateNoveltyScore(track, userProfile) {
    // Higher score for tracks that are different but not too different
    const isKnownArtist = userProfile.topArtists.some(artist => 
      track.artists.some(trackArtist => trackArtist.id === artist.id)
    );

    const isRecentlyPlayed = this.isRecentlyPlayed(track, userProfile.recentTracks);

    if (isRecentlyPlayed) return 0.1; // Low novelty
    if (isKnownArtist) return 0.6; // Medium novelty
    
    // New artist - higher novelty but consider popularity for safety
    const popularity = track.popularity || 0;
    if (popularity > 20) return 0.8; // Good discovery potential
    return 0.5; // Unknown territory
  }

  /**
   * Infer track genres based on artist and context
   */
  inferTrackGenres(track, candidateGenres) {
    // This is a simplified implementation
    // In a real system, you'd use the Spotify API to get artist genres
    const inferredGenres = [];
    
    candidateGenres.forEach(genre => {
      // Simple heuristic: if genre appears in candidate list, assume it might apply
      inferredGenres.push({ name: genre.name, confidence: genre.weight });
    });

    return inferredGenres.slice(0, 3); // Top 3 inferred genres
  }

  /**
   * Calculate mood matching score
   */
  calculateMoodMatch(track, context, moodTags) {
    let score = 0;
    
    const trackName = track.name.toLowerCase();
    const contextMood = context.moodDetected?.primary;
    
    // Simple keyword matching
    if (contextMood === 'happy' && (trackName.includes('happy') || trackName.includes('joy'))) {
      score += 0.5;
    }
    if (contextMood === 'calm' && (trackName.includes('calm') || trackName.includes('peace'))) {
      score += 0.5;
    }
    if (context.weather?.condition === 'rainy' && trackName.includes('rain')) {
      score += 0.3;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Check if track was recently played
   */
  isRecentlyPlayed(track, recentTracks) {
    return recentTracks.some(recent => recent.id === track.id);
  }

  /**
   * Select final tracks with diversity optimization
   */
  selectFinalTracks(rankedTracks, targetLength, diversityWeight = 0.3) {
    const selected = [];
    const seenArtists = new Set();
    const seenGenres = new Set();
    
    for (const track of rankedTracks) {
      if (selected.length >= targetLength) break;
      
      // Diversity penalty
      let diversityPenalty = 0;
      
      const artistNames = track.artists.map(a => a.name);
      const hasSeenArtist = artistNames.some(name => seenArtists.has(name));
      
      if (hasSeenArtist) diversityPenalty += 0.3;
      if (selected.length > 0 && selected.length % 5 === 0) {
        // Every 5 tracks, prefer some diversity
        diversityPenalty *= 1.5;
      }

      const adjustedScore = track.score * (1 - diversityPenalty * diversityWeight);
      
      if (adjustedScore > 0.2 || selected.length < targetLength * 0.7) {
        selected.push({
          ...track,
          finalScore: adjustedScore
        });
        
        // Track diversity
        artistNames.forEach(name => seenArtists.add(name));
      }
    }

    // If we don't have enough tracks, fill with top remaining tracks
    if (selected.length < targetLength) {
      const remaining = rankedTracks
        .filter(track => !selected.some(s => s.id === track.id))
        .slice(0, targetLength - selected.length);
      
      selected.push(...remaining.map(track => ({
        ...track,
        finalScore: track.score * 0.8 // Slightly penalize fallback tracks
      })));
    }

    return selected.slice(0, targetLength);
  }

  /**
   * Calculate recommendation confidence
   */
  calculateConfidence(recommendations, ruleResults) {
    if (recommendations.length === 0) return 0;

    const avgScore = recommendations.reduce((sum, track) => sum + (track.score || 0), 0) / recommendations.length;
    const ruleConfidence = ruleResults.appliedRules.length > 0 ? 0.8 : 0.4;
    
    return Math.max(0, Math.min(1, avgScore * 0.6 + ruleConfidence * 0.4));
  }

  /**
   * Calculate diversity metrics
   */
  calculateDiversity(recommendations) {
    const artists = new Set();
    const genres = new Set();
    let totalTempo = 0;
    let totalMood = 0;

    recommendations.forEach(track => {
      track.artists.forEach(artist => artists.add(artist.name));
      totalTempo += track.tempo || 120; // Default tempo
      totalMood += track.valence || 0.5; // Default valence
    });

    return {
      artistCount: artists.size,
      genreCount: genres.size,
      tempoVariance: this.calculateVariance(recommendations.map(t => t.tempo || 120)),
      moodVariance: this.calculateVariance(recommendations.map(t => t.valence || 0.5))
    };
  }

  /**
   * Calculate variance of an array
   */
  calculateVariance(values) {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Generate playlist name based on context
   */
  generatePlaylistName(context) {
    const timeEmojis = {
      morning: '🌅',
      afternoon: '☀️',
      evening: '🌆',
      night: '🌙'
    };

    const weatherEmojis = {
      sunny: '☀️',
      cloudy: '☁️',
      rainy: '🌧️',
      stormy: '⛈️',
      snow: '❄️',
      fog: '🌫️'
    };

    const timeOfDay = context.timeOfDay || 'unknown';
    const weather = context.weather?.condition || 'unknown';
    const city = context.geoLocation?.city || 'Unknown';
    const temp = context.weather?.temperature ? `${Math.round(context.weather.temperature)}°` : '';

    const timeEmoji = timeEmojis[timeOfDay] || '🎵';
    const weatherEmoji = weatherEmojis[weather] || '';

    const templates = [
      `${timeEmoji} ${timeOfDay.charAt(0).toUpperCase() + timeOfDay.slice(1)} ${weather.charAt(0).toUpperCase() + weather.slice(1)} • ${city} ${temp}`,
      `${weatherEmoji} ${weather.charAt(0).toUpperCase() + weather.slice(1)} ${timeOfDay} • ${city}`,
      `🎵 ${timeOfDay.charAt(0).toUpperCase() + timeOfDay.slice(1)} Vibes • ${city} ${temp}`
    ];

    return templates[Math.floor(Math.random() * templates.length)].trim();
  }

  /**
   * Generate playlist description
   */
  generatePlaylistDescription(context, recommendations) {
    const timeOfDay = context.timeOfDay || 'unknown time';
    const weather = context.weather?.condition || 'any weather';
    const city = context.geoLocation?.city || 'your location';
    const trackCount = recommendations.length;
    
    const templates = [
      `Perfect for ${timeOfDay} during ${weather} weather in ${city}. ${trackCount} carefully selected tracks to match your mood and moment.`,
      `AI-generated playlist for your ${timeOfDay} ${weather} session in ${city}. Featuring ${trackCount} tracks tailored to this moment.`,
      `Context-aware music for ${timeOfDay} in ${city}. ${trackCount} songs that fit the ${weather} atmosphere.`
    ];

    return templates[Math.floor(Math.random() * templates.length)];
  }


  /**
   * Generate two-part recommendations: from user playlists and global recommendations
   */
  async generateTwoPartRecommendations(accessToken, context, userProfile, options = {}) {
    const targetLength = options.targetLength || 20;
    const userPlaylistTarget = Math.floor(targetLength * 0.4); // 40% from user playlists
    const globalTarget = targetLength - userPlaylistTarget; // 60% from global

    try {
      // Part 1: Get recommendations from user's playlists
      const fromUserPlaylists = await this.getRecommendationsFromUserPlaylists(
        accessToken,
        context,
        userProfile,
        userPlaylistTarget
      );

      // Part 2: Get global recommendations
      const fromGlobalRecommendations = await this.getGlobalRecommendations(
        accessToken,
        context,
        userProfile,
        globalTarget
      );

      // Combine for diversity calculation
      const combined = [
        ...(fromUserPlaylists || []),
        ...(fromGlobalRecommendations || [])
      ];

      return {
        fromUserPlaylists: fromUserPlaylists?.length > 0 ? fromUserPlaylists : null,
        fromGlobalRecommendations,
        combined
      };
    } catch (error) {
      logger.error('Error generating two-part recommendations:', error);
      throw error;
    }
  }

  /**
   * Get recommendations from user's playlists
   */
  async getRecommendationsFromUserPlaylists(accessToken, context, userProfile, targetCount) {
    try {
      // Get user's playlists
      const userPlaylists = await spotifyService.getUserPlaylists(accessToken);
      
      if (!userPlaylists || userPlaylists.length === 0) {
        logger.info('No user playlists found');
        return null;
      }

      // Get tracks from user's playlists
      let playlistTracks = [];
      for (const playlist of userPlaylists.slice(0, 10)) { // Limit to 10 playlists
        try {
          const tracks = await spotifyService.getPlaylistTracks(accessToken, playlist.id);
          playlistTracks.push(...tracks.slice(0, 50)); // Limit tracks per playlist
        } catch (error) {
          logger.warn(`Failed to get tracks from playlist ${playlist.id}:`, error);
        }
      }

      if (playlistTracks.length === 0) {
        return null;
      }

      // Remove duplicates
      const uniqueTracks = this.removeDuplicateTracks(playlistTracks);

      // Apply context-based filtering
      const contextFiltered = this.filterTracksByContext(uniqueTracks, context);
      
      if (contextFiltered.length === 0) {
        return null;
      }

      // Rank and select final tracks
      const rankedTracks = await this.rankTracks(contextFiltered, context, userProfile, []);
      const selectedTracks = this.selectFinalTracks(rankedTracks, targetCount, 0.5);

      // Add source information
      return selectedTracks.map(track => ({
        ...track,
        source: 'user_playlist',
        reasons: [...(track.reasons || []), 'From your playlists']
      }));

    } catch (error) {
      logger.error('Error getting recommendations from user playlists:', error);
      return null;
    }
  }

  /**
   * Get global recommendations using existing system
   */
  async getGlobalRecommendations(accessToken, context, userProfile, targetCount) {
    try {
      // Get rule-based candidates
      const ruleResults = await ruleEngine.getCandidates(context, userProfile);
      
      // Get tracks from Spotify based on candidates
      const candidateTracks = await this.fetchCandidateTracks(
        accessToken, 
        ruleResults.candidates, 
        targetCount * 2 // Get more candidates for better selection
      );

      if (candidateTracks.length === 0) {
        throw new Error('No candidate tracks found for global recommendations');
      }

      // Apply ML ranking
      const rankedTracks = await this.rankTracks(
        candidateTracks,
        context,
        userProfile,
        ruleResults.candidates
      );

      // Generate final recommendations
      const selectedTracks = this.selectFinalTracks(rankedTracks, targetCount, 0.3);

      // Add source information
      return selectedTracks.map(track => ({
        ...track,
        source: 'global',
        reasons: [...(track.reasons || []), 'Discover new music']
      }));

    } catch (error) {
      logger.error('Error getting global recommendations:', error);
      throw error;
    }
  }

  /**
   * Remove duplicate tracks based on track ID
   */
  removeDuplicateTracks(tracks) {
    const seen = new Set();
    return tracks.filter(track => {
      if (seen.has(track.id)) {
        return false;
      }
      seen.add(track.id);
      return true;
    });
  }

  /**
   * Filter tracks based on context
   */
  filterTracksByContext(tracks, context) {
    // Basic context filtering - can be enhanced based on requirements
    return tracks.filter(track => {
      // Example: filter explicit content for morning time
      if (context.timeOfDay === 'morning' && track.explicit) {
        return false;
      }
      return true;
    });
  }

  /**
   * Calculate confidence for two-part recommendations
   */
  calculateTwoPartConfidence(twoPartRecommendations) {
    const userPlaylistTracks = twoPartRecommendations.fromUserPlaylists || [];
    const globalTracks = twoPartRecommendations.fromGlobalRecommendations || [];
    
    if (userPlaylistTracks.length === 0 && globalTracks.length === 0) return 0;

    const userAvgScore = userPlaylistTracks.length > 0 
      ? userPlaylistTracks.reduce((sum, track) => sum + (track.score || 0), 0) / userPlaylistTracks.length
      : 0;
    
    const globalAvgScore = globalTracks.length > 0
      ? globalTracks.reduce((sum, track) => sum + (track.score || 0), 0) / globalTracks.length
      : 0;

    // Weighted confidence (higher weight for user playlist matches)
    const userWeight = userPlaylistTracks.length > 0 ? 0.6 : 0;
    const globalWeight = globalTracks.length > 0 ? 0.4 : 0;
    
    const totalWeight = userWeight + globalWeight;
    if (totalWeight === 0) return 0;

    return Math.max(0, Math.min(1, (userAvgScore * userWeight + globalAvgScore * globalWeight) / totalWeight));
  }

  /**
   * Log recommendation to database
   */
  async logRecommendation(logData) {
    try {
      const recommendationLog = new RecommendationLog(logData);
      await recommendationLog.save();
    } catch (error) {
      logger.error('Error logging recommendation:', error);
      // Don't throw error as this is not critical for user experience
    }
  }
}

module.exports = new RecommendationEngine();