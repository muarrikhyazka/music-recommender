const spotifyService = require('./spotifyService');
const recommendationEngine = require('./recommendationEngine');
const contextService = require('./contextService');
const logger = require('../utils/logger');
const User = require('../models/User');
const Playlist = require('../models/Playlist');
const Song = require('../models/Song');
const RecommendationLog = require('../models/RecommendationLog');
const { v4: uuidv4 } = require('crypto');

class PlaylistGenerator {
  constructor() {
    this.defaultPlaylistLength = 20;
    this.maxPlaylistLength = 50;
    this.minPlaylistLength = 10;
  }

  /**
   * Generate and create a complete playlist for the user
   */
  async generateAndCreatePlaylist(userId, contextData = null, options = {}) {
    const startTime = Date.now();
    
    try {
      logger.info('Starting playlist generation and creation', { userId, options });

      // Get user
      const user = await User.findById(userId).select('+tokens');
      if (!user) {
        throw new Error('User not found');
      }

      // Get current context or use provided context
      const context = contextData || await contextService.getCurrentContext(
        userId,
        options.userLocation,
        { ip: options.clientIp, ...options.deviceInfo }
      );

      // Generate recommendations
      const recommendationResult = await recommendationEngine.generateRecommendations(
        userId, 
        context, 
        {
          targetLength: options.targetLength || this.defaultPlaylistLength,
          diversityWeight: options.diversityWeight || 0.3
        }
      );

      const { recommendations, metadata } = recommendationResult;

      if (recommendations.length === 0) {
        throw new Error('No recommendations generated');
      }

      // Create playlist on Spotify
      const playlistResult = await this.createSpotifyPlaylist(
        user,
        recommendations,
        metadata,
        context,
        options
      );

      // Save to database
      const savedPlaylist = await this.savePlaylistToDatabase(
        user._id,
        playlistResult,
        recommendations,
        context,
        metadata
      );

      // Update recommendation log with playlist creation
      await this.updateRecommendationLog(metadata.recId, {
        playlistCreated: true,
        spotifyPlaylistId: playlistResult.id,
        spotifyUrl: playlistResult.externalUrls.spotify
      });

      const totalTime = Date.now() - startTime;

      logger.info('Playlist generation and creation completed', {
        userId,
        playlistId: savedPlaylist._id,
        spotifyPlaylistId: playlistResult.id,
        trackCount: recommendations.length,
        totalTime
      });

      return {
        success: true,
        playlist: {
          id: savedPlaylist._id,
          spotifyId: playlistResult.id,
          name: playlistResult.name,
          description: playlistResult.description,
          trackCount: recommendations.length,
          spotifyUrl: playlistResult.externalUrls.spotify,
          tracks: recommendations.slice(0, 5), // Preview tracks
          context: {
            timeOfDay: context.timeOfDay,
            weather: context.weather?.condition,
            location: context.geoLocation?.city,
            temperature: context.weather?.temperature
          }
        },
        metadata: {
          ...metadata,
          totalProcessingTime: totalTime,
          createdAt: new Date().toISOString()
        }
      };

    } catch (error) {
      logger.error('Error in playlist generation and creation:', error);
      
      // Return fallback response
      return {
        success: false,
        error: error.message,
        fallback: await this.generateFallbackResponse(userId, contextData, error)
      };
    }
  }

  /**
   * Create playlist on Spotify
   */
  async createSpotifyPlaylist(user, recommendations, metadata, context, options = {}) {
    try {
      const accessToken = await spotifyService.ensureValidToken(user);
      
      // Check for idempotency - don't create duplicate playlists within time window
      if (!options.forceCreate) {
        const existingPlaylist = await this.findRecentSimilarPlaylist(
          user._id, 
          context, 
          options.idempotencyWindow || 2 * 60 * 60 * 1000 // 2 hours
        );
        
        if (existingPlaylist) {
          logger.info('Found recent similar playlist, returning existing', {
            playlistId: existingPlaylist.spotifyPlaylistId
          });
          
          return {
            id: existingPlaylist.spotifyPlaylistId,
            name: existingPlaylist.name,
            description: existingPlaylist.description,
            externalUrls: { spotify: existingPlaylist.spotifyUrl },
            isExisting: true
          };
        }
      }

      // Create playlist
      const playlistName = metadata.playlistName || this.generateDefaultPlaylistName(context);
      const playlistDescription = metadata.playlistDescription || this.generateDefaultDescription(context);
      
      const playlist = await spotifyService.createPlaylist(
        accessToken,
        user.spotifyId,
        playlistName,
        playlistDescription,
        options.isPublic || false
      );

      // Add tracks to playlist
      const trackUris = recommendations
        .map(track => track.uri)
        .filter(uri => uri && uri.startsWith('spotify:track:'));

      if (trackUris.length === 0) {
        throw new Error('No valid Spotify track URIs found');
      }

      const addTracksResult = await spotifyService.addTracksToPlaylist(
        accessToken,
        playlist.id,
        trackUris
      );

      logger.info('Playlist created on Spotify', {
        playlistId: playlist.id,
        trackCount: addTracksResult.totalTracksAdded,
        name: playlist.name
      });

      return {
        ...playlist,
        tracksAdded: addTracksResult.totalTracksAdded,
        snapshots: addTracksResult.snapshots
      };

    } catch (error) {
      logger.error('Error creating Spotify playlist:', error);
      throw new Error(`Failed to create Spotify playlist: ${error.message}`);
    }
  }

  /**
   * Save playlist information to database
   */
  async savePlaylistToDatabase(userId, playlistResult, recommendations, context, metadata) {
    try {
      const playlistDoc = new Playlist({
        playlistId: uuidv4(),
        spotifyPlaylistId: playlistResult.id,
        name: playlistResult.name,
        description: playlistResult.description,
        type: 'generated',
        isPublic: playlistResult.public || false,
        createdBy: userId,
        context: {
          timeOfDay: context.timeOfDay,
          weather: context.weather?.condition,
          temperature: context.weather?.temperature,
          location: {
            city: context.geoLocation?.city,
            country: context.geoLocation?.country,
            coordinates: context.geoLocation?.coordinates
          },
          season: context.season
        },
        tracks: await this.formatTracksForDatabase(recommendations),
        totalDuration: recommendations.reduce((sum, track) => sum + (track.duration || 0), 0),
        trackCount: recommendations.length,
        tags: this.generatePlaylistTags(context, recommendations),
        spotifyUrl: playlistResult.externalUrls?.spotify,
        stats: {
          plays: 0,
          skips: 0,
          saves: 0,
          shares: 0
        }
      });

      await playlistDoc.save();

      // Also save/update song documents
      await this.saveRecommendedSongs(recommendations);

      return playlistDoc;
    } catch (error) {
      logger.error('Error saving playlist to database:', error);
      throw new Error('Failed to save playlist to database');
    }
  }

  /**
   * Format tracks for database storage
   */
  async formatTracksForDatabase(recommendations) {
    return recommendations.map((track, index) => ({
      // We'll create/update Song documents separately
      songId: null, // Will be populated after saving songs
      spotifyTrackId: track.id,
      position: index,
      addedAt: new Date()
    }));
  }

  /**
   * Save or update recommended songs in database
   */
  async saveRecommendedSongs(recommendations) {
    try {
      for (const track of recommendations) {
        const songData = {
          songId: track.id,
          spotifyId: track.id,
          title: track.name,
          artist: track.artists[0]?.name || 'Unknown Artist',
          album: track.album || 'Unknown Album',
          artists: track.artists.map(artist => ({
            id: artist.id,
            name: artist.name,
            uri: artist.uri
          })),
          popularity: track.popularity || 0,
          durationMs: track.duration || 0,
          explicit: track.explicit || false,
          previewUrl: track.previewUrl,
          externalUrls: track.externalUrls || {},
          // Audio features and mood tags would be populated separately
          moodTags: this.inferMoodTags(track),
          contextTags: this.inferContextTags(track)
        };

        await Song.findOneAndUpdate(
          { spotifyId: track.id },
          songData,
          { upsert: true, new: true }
        );
      }
    } catch (error) {
      logger.error('Error saving recommended songs:', error);
      // Don't throw error as this is not critical for user experience
    }
  }

  /**
   * Infer mood tags from track data
   */
  inferMoodTags(track) {
    const tags = [];
    const name = track.name.toLowerCase();
    
    // Simple keyword-based mood inference
    if (name.includes('happy') || name.includes('joy') || name.includes('smile')) {
      tags.push('happy');
    }
    if (name.includes('sad') || name.includes('cry') || name.includes('blue')) {
      tags.push('sad');
    }
    if (name.includes('love') || name.includes('heart')) {
      tags.push('romantic');
    }
    if (name.includes('energy') || name.includes('power') || name.includes('strong')) {
      tags.push('energetic');
    }
    if (name.includes('chill') || name.includes('relax') || name.includes('calm')) {
      tags.push('chill');
    }

    return tags.length > 0 ? tags : ['general'];
  }

  /**
   * Infer context tags from track data
   */
  inferContextTags(track) {
    const tags = [];
    const name = track.name.toLowerCase();
    
    if (name.includes('morning') || name.includes('sunrise')) tags.push('morning');
    if (name.includes('night') || name.includes('midnight')) tags.push('night');
    if (name.includes('rain') || name.includes('storm')) tags.push('rainy');
    if (name.includes('sun') || name.includes('bright')) tags.push('sunny');
    if (name.includes('work') || name.includes('focus')) tags.push('work');
    if (name.includes('drive') || name.includes('road')) tags.push('commute');

    return tags;
  }

  /**
   * Generate tags for the playlist
   */
  generatePlaylistTags(context, recommendations) {
    const tags = [];

    // Context-based tags
    if (context.timeOfDay) tags.push(context.timeOfDay);
    if (context.weather?.condition) tags.push(context.weather.condition);
    if (context.season) tags.push(context.season);
    if (context.geoLocation?.city) tags.push(context.geoLocation.city.toLowerCase());

    // Temperature-based tags
    if (context.weather?.temperature) {
      const temp = context.weather.temperature;
      if (temp > 25) tags.push('hot');
      else if (temp > 15) tags.push('warm');
      else if (temp > 5) tags.push('cool');
      else tags.push('cold');
    }

    // Mood-based tags
    if (context.moodDetected?.primary) tags.push(context.moodDetected.primary);

    // Generated playlist tag
    tags.push('ai-generated', 'context-aware');

    return [...new Set(tags)]; // Remove duplicates
  }

  /**
   * Find recent similar playlist to avoid duplicates
   */
  async findRecentSimilarPlaylist(userId, context, timeWindow) {
    try {
      const cutoffTime = new Date(Date.now() - timeWindow);
      
      const similarPlaylist = await Playlist.findOne({
        createdBy: userId,
        createdAt: { $gte: cutoffTime },
        'context.timeOfDay': context.timeOfDay,
        'context.weather': context.weather?.condition,
        'context.location.city': context.geoLocation?.city,
        isActive: true
      }).sort({ createdAt: -1 });

      return similarPlaylist;
    } catch (error) {
      logger.error('Error finding recent similar playlist:', error);
      return null;
    }
  }

  /**
   * Generate default playlist name if metadata doesn't provide one
   */
  generateDefaultPlaylistName(context) {
    const timeOfDay = context.timeOfDay || 'moment';
    const weather = context.weather?.condition || 'vibes';
    const city = context.geoLocation?.city || 'here';
    
    return `${timeOfDay.charAt(0).toUpperCase() + timeOfDay.slice(1)} ${weather} • ${city}`;
  }

  /**
   * Generate default description
   */
  generateDefaultDescription(context) {
    return `AI-generated playlist for ${context.timeOfDay || 'your current moment'} in ${context.geoLocation?.city || 'your location'}`;
  }

  /**
   * Update recommendation log with playlist creation status
   */
  async updateRecommendationLog(recId, updates) {
    try {
      await RecommendationLog.findOneAndUpdate(
        { recId },
        { 
          'userInteraction.created': true,
          'userInteraction.createdAt': new Date(),
          'output.spotifyPlaylistId': updates.spotifyPlaylistId,
          'output.spotifyUrl': updates.spotifyUrl
        }
      );
    } catch (error) {
      logger.error('Error updating recommendation log:', error);
      // Don't throw error as this is not critical
    }
  }

  /**
   * Generate fallback response when playlist creation fails
   */
  async generateFallbackResponse(userId, contextData, originalError) {
    try {
      // Try to provide alternative options
      const fallbackOptions = [];

      // Option 1: Curated playlist recommendation
      fallbackOptions.push({
        type: 'curated',
        title: 'Curated Playlist',
        description: 'Hand-picked playlist for similar moods',
        action: 'redirect',
        url: 'https://open.spotify.com/playlist/37i9dQZF1DX0XUsuxWHRQd' // Example Spotify playlist
      });

      // Option 2: Genre-based search
      if (contextData?.timeOfDay) {
        const searchQuery = `${contextData.timeOfDay} ${contextData.weather?.condition || 'music'}`;
        fallbackOptions.push({
          type: 'search',
          title: 'Search Spotify',
          description: `Search for "${searchQuery}" on Spotify`,
          action: 'search',
          query: searchQuery
        });
      }

      // Option 3: Popular playlists
      fallbackOptions.push({
        type: 'popular',
        title: 'Popular Now',
        description: 'Currently trending playlists',
        action: 'redirect',
        url: 'https://open.spotify.com/browse/featured'
      });

      return {
        message: 'Unable to create custom playlist at this time',
        reason: originalError.message,
        alternatives: fallbackOptions,
        retryAvailable: true,
        retryDelay: 60000 // 1 minute
      };
    } catch (error) {
      logger.error('Error generating fallback response:', error);
      return {
        message: 'Service temporarily unavailable',
        alternatives: [],
        retryAvailable: true,
        retryDelay: 300000 // 5 minutes
      };
    }
  }

  /**
   * Preview recommendations without creating playlist
   */
  async previewRecommendations(userId, contextData = null, options = {}) {
    try {
      logger.info('Generating recommendation preview', { userId });

      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const context = contextData || await contextService.getCurrentContext(
        userId,
        options.userLocation,
        { ip: options.clientIp, ...options.deviceInfo }
      );

      const recommendationResult = await recommendationEngine.generateRecommendations(
        userId, 
        context, 
        {
          targetLength: options.targetLength || this.defaultPlaylistLength,
          diversityWeight: options.diversityWeight || 0.3
        }
      );

      const { recommendations, metadata } = recommendationResult;

      return {
        success: true,
        preview: {
          name: metadata.playlistName,
          description: metadata.playlistDescription,
          trackCount: recommendations.length,
          tracks: recommendations.slice(0, 5), // Show first 5 tracks
          context: {
            timeOfDay: context.timeOfDay,
            weather: context.weather?.condition,
            location: context.geoLocation?.city,
            temperature: context.weather?.temperature
          },
          confidence: metadata.confidence,
          processingTime: metadata.processingTime
        },
        metadata: {
          recId: metadata.recId,
          canCreate: true,
          estimatedCreationTime: 3000 // 3 seconds
        }
      };

    } catch (error) {
      logger.error('Error generating recommendation preview:', error);
      return {
        success: false,
        error: error.message,
        preview: null
      };
    }
  }

  /**
   * Get user's playlist history
   */
  async getUserPlaylistHistory(userId, limit = 20, offset = 0) {
    try {
      const playlists = await Playlist.findByUser(userId, limit)
        .skip(offset)
        .select('playlistId name createdAt context stats spotifyUrl trackCount')
        .lean();

      return {
        success: true,
        playlists: playlists.map(playlist => ({
          id: playlist.playlistId,
          name: playlist.name,
          createdAt: playlist.createdAt,
          context: playlist.context,
          stats: playlist.stats,
          spotifyUrl: playlist.spotifyUrl,
          trackCount: playlist.trackCount
        })),
        pagination: {
          limit,
          offset,
          hasMore: playlists.length === limit
        }
      };
    } catch (error) {
      logger.error('Error getting user playlist history:', error);
      return {
        success: false,
        error: error.message,
        playlists: []
      };
    }
  }
}

module.exports = new PlaylistGenerator();