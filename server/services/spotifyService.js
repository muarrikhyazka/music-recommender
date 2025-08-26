const SpotifyWebApi = require('spotify-web-api-node');
const axios = require('axios');
const logger = require('../utils/logger');
const User = require('../models/User');
const NodeCache = require('node-cache');

class SpotifyService {
  constructor() {
    this.clientId = process.env.SPOTIFY_CLIENT_ID;
    this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    this.redirectUri = process.env.SPOTIFY_REDIRECT_URI;
    
    // Cache for 5 minutes for user data
    this.cache = new NodeCache({ stdTTL: 300 });
    
    this.spotifyApi = new SpotifyWebApi({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      redirectUri: this.redirectUri
    });

    this.scopes = [
      'user-read-private',
      'user-read-email',
      'user-read-recently-played',
      'user-top-read',
      'playlist-modify-public',
      'playlist-modify-private',
      'user-library-read',
      'user-read-playback-state',
      'user-modify-playback-state'
    ];
  }

  /**
   * Get authorization URL for Spotify OAuth
   */
  getAuthorizationUrl(state) {
    return this.spotifyApi.createAuthorizeURL(this.scopes, state);
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForTokens(code) {
    try {
      const data = await this.spotifyApi.authorizationCodeGrant(code);
      
      return {
        accessToken: data.body.access_token,
        refreshToken: data.body.refresh_token,
        expiresIn: data.body.expires_in,
        expiresAt: new Date(Date.now() + data.body.expires_in * 1000)
      };
    } catch (error) {
      logger.error('Error exchanging code for tokens:', error);
      throw new Error('Failed to exchange authorization code');
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken) {
    try {
      this.spotifyApi.setRefreshToken(refreshToken);
      const data = await this.spotifyApi.refreshAccessToken();
      
      return {
        accessToken: data.body.access_token,
        expiresIn: data.body.expires_in,
        expiresAt: new Date(Date.now() + data.body.expires_in * 1000),
        refreshToken: data.body.refresh_token || refreshToken // Keep old refresh token if new one not provided
      };
    } catch (error) {
      logger.error('Error refreshing access token:', error);
      throw new Error('Failed to refresh access token');
    }
  }

  /**
   * Get user profile from Spotify
   */
  async getUserProfile(accessToken) {
    try {
      const cacheKey = `profile_${accessToken.substring(0, 10)}`;
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;

      this.spotifyApi.setAccessToken(accessToken);
      const data = await this.spotifyApi.getMe();
      
      const profile = {
        spotifyId: data.body.id,
        displayName: data.body.display_name,
        email: data.body.email,
        country: data.body.country,
        followers: data.body.followers?.total || 0,
        images: data.body.images || [],
        product: data.body.product
      };

      this.cache.set(cacheKey, profile, 300); // Cache for 5 minutes
      return profile;
    } catch (error) {
      logger.error('Error getting user profile:', error);
      throw new Error('Failed to get user profile');
    }
  }

  /**
   * Get user's top tracks
   */
  async getUserTopTracks(accessToken, timeRange = 'medium_term', limit = 50) {
    try {
      const cacheKey = `top_tracks_${accessToken.substring(0, 10)}_${timeRange}_${limit}`;
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;

      this.spotifyApi.setAccessToken(accessToken);
      const data = await this.spotifyApi.getMyTopTracks({
        time_range: timeRange,
        limit: limit
      });

      const tracks = data.body.items.map(track => ({
        id: track.id,
        name: track.name,
        artists: track.artists.map(artist => ({
          id: artist.id,
          name: artist.name
        })),
        album: track.album.name,
        popularity: track.popularity,
        duration: track.duration_ms,
        explicit: track.explicit,
        previewUrl: track.preview_url,
        uri: track.uri,
        externalUrls: track.external_urls
      }));

      this.cache.set(cacheKey, tracks, 600); // Cache for 10 minutes
      return tracks;
    } catch (error) {
      logger.error('Error getting user top tracks:', error);
      throw new Error('Failed to get user top tracks');
    }
  }

  /**
   * Get user's top artists
   */
  async getUserTopArtists(accessToken, timeRange = 'medium_term', limit = 50) {
    try {
      const cacheKey = `top_artists_${accessToken.substring(0, 10)}_${timeRange}_${limit}`;
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;

      this.spotifyApi.setAccessToken(accessToken);
      const data = await this.spotifyApi.getMyTopArtists({
        time_range: timeRange,
        limit: limit
      });

      const artists = data.body.items.map(artist => ({
        id: artist.id,
        name: artist.name,
        genres: artist.genres,
        popularity: artist.popularity,
        followers: artist.followers?.total || 0,
        images: artist.images || [],
        uri: artist.uri,
        externalUrls: artist.external_urls
      }));

      this.cache.set(cacheKey, artists, 600); // Cache for 10 minutes
      return artists;
    } catch (error) {
      logger.error('Error getting user top artists:', error);
      throw new Error('Failed to get user top artists');
    }
  }

  /**
   * Get user's recently played tracks
   */
  async getRecentlyPlayed(accessToken, limit = 50) {
    try {
      const cacheKey = `recent_${accessToken.substring(0, 10)}_${limit}`;
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;

      this.spotifyApi.setAccessToken(accessToken);
      const data = await this.spotifyApi.getMyRecentlyPlayedTracks({
        limit: limit
      });

      const tracks = data.body.items.map(item => ({
        track: {
          id: item.track.id,
          name: item.track.name,
          artists: item.track.artists.map(artist => ({
            id: artist.id,
            name: artist.name
          })),
          album: item.track.album.name,
          popularity: item.track.popularity,
          duration: item.track.duration_ms,
          uri: item.track.uri
        },
        playedAt: item.played_at,
        context: item.context
      }));

      this.cache.set(cacheKey, tracks, 180); // Cache for 3 minutes
      return tracks;
    } catch (error) {
      logger.error('Error getting recently played tracks:', error);
      throw new Error('Failed to get recently played tracks');
    }
  }

  /**
   * Search for tracks based on criteria
   */
  async searchTracks(accessToken, query, options = {}) {
    try {
      this.spotifyApi.setAccessToken(accessToken);
      
      const searchOptions = {
        q: query,
        type: 'track',
        limit: options.limit || 50,
        offset: options.offset || 0,
        market: options.market || 'US'
      };

      const data = await this.spotifyApi.search(searchOptions.q, [searchOptions.type], searchOptions);

      return data.body.tracks.items.map(track => ({
        id: track.id,
        name: track.name,
        artists: track.artists.map(artist => ({
          id: artist.id,
          name: artist.name
        })),
        album: track.album.name,
        popularity: track.popularity,
        duration: track.duration_ms,
        explicit: track.explicit,
        previewUrl: track.preview_url,
        uri: track.uri,
        externalUrls: track.external_urls
      }));
    } catch (error) {
      logger.error('Error searching tracks:', error);
      throw new Error('Failed to search tracks');
    }
  }

  /**
   * Get audio features for tracks
   */
  async getAudioFeatures(accessToken, trackIds) {
    try {
      if (!trackIds || trackIds.length === 0) return [];

      const cacheKey = `audio_features_${trackIds.sort().join(',').substring(0, 50)}`;
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;

      this.spotifyApi.setAccessToken(accessToken);
      
      // Spotify API allows max 100 tracks at once
      const chunks = this.chunkArray(trackIds, 100);
      const allFeatures = [];

      for (const chunk of chunks) {
        const data = await this.spotifyApi.getAudioFeaturesForTracks(chunk);
        allFeatures.push(...(data.body.audio_features || []));
      }

      const features = allFeatures.filter(f => f !== null).map(feature => ({
        id: feature.id,
        danceability: feature.danceability,
        energy: feature.energy,
        key: feature.key,
        loudness: feature.loudness,
        mode: feature.mode,
        speechiness: feature.speechiness,
        acousticness: feature.acousticness,
        instrumentalness: feature.instrumentalness,
        liveness: feature.liveness,
        valence: feature.valence,
        tempo: feature.tempo,
        duration: feature.duration_ms,
        timeSignature: feature.time_signature
      }));

      this.cache.set(cacheKey, features, 3600); // Cache for 1 hour
      return features;
    } catch (error) {
      logger.error('Error getting audio features:', error);
      throw new Error('Failed to get audio features');
    }
  }

  /**
   * Create a playlist for the user
   */
  async createPlaylist(accessToken, userId, name, description = '', isPublic = false) {
    try {
      this.spotifyApi.setAccessToken(accessToken);
      
      const data = await this.spotifyApi.createPlaylist(userId, name, {
        description: description,
        public: isPublic
      });

      return {
        id: data.body.id,
        name: data.body.name,
        description: data.body.description,
        public: data.body.public,
        collaborative: data.body.collaborative,
        uri: data.body.uri,
        externalUrls: data.body.external_urls,
        images: data.body.images || [],
        tracks: {
          total: 0
        }
      };
    } catch (error) {
      logger.error('Error creating playlist:', error);
      throw new Error('Failed to create playlist');
    }
  }

  /**
   * Add tracks to a playlist
   */
  async addTracksToPlaylist(accessToken, playlistId, trackUris) {
    try {
      if (!trackUris || trackUris.length === 0) {
        throw new Error('No tracks to add');
      }

      this.spotifyApi.setAccessToken(accessToken);
      
      // Spotify API allows max 100 tracks at once
      const chunks = this.chunkArray(trackUris, 100);
      const results = [];

      for (const chunk of chunks) {
        const data = await this.spotifyApi.addTracksToPlaylist(playlistId, chunk);
        results.push({
          snapshotId: data.body.snapshot_id,
          tracksAdded: chunk.length
        });
      }

      return {
        totalTracksAdded: trackUris.length,
        snapshots: results
      };
    } catch (error) {
      logger.error('Error adding tracks to playlist:', error);
      throw new Error('Failed to add tracks to playlist');
    }
  }

  /**
   * Get recommendations from Spotify
   */
  async getRecommendations(accessToken, options = {}) {
    try {
      this.spotifyApi.setAccessToken(accessToken);
      
      const recommendationOptions = {
        limit: options.limit || 20,
        market: options.market || 'US',
        seed_artists: options.seedArtists || [],
        seed_genres: options.seedGenres || [],
        seed_tracks: options.seedTracks || [],
        ...this.formatAudioFeatureTargets(options.audioFeatures || {})
      };

      // Ensure we have at least one seed
      if (recommendationOptions.seed_artists.length === 0 && 
          recommendationOptions.seed_genres.length === 0 && 
          recommendationOptions.seed_tracks.length === 0) {
        recommendationOptions.seed_genres = ['pop']; // Default genre
      }

      const data = await this.spotifyApi.getRecommendations(recommendationOptions);

      return data.body.tracks.map(track => ({
        id: track.id,
        name: track.name,
        artists: track.artists.map(artist => ({
          id: artist.id,
          name: artist.name
        })),
        album: track.album.name,
        popularity: track.popularity,
        duration: track.duration_ms,
        explicit: track.explicit,
        previewUrl: track.preview_url,
        uri: track.uri,
        externalUrls: track.external_urls
      }));
    } catch (error) {
      logger.error('Error getting recommendations:', error);
      throw new Error('Failed to get recommendations');
    }
  }

  /**
   * Format audio feature targets for Spotify API
   */
  formatAudioFeatureTargets(audioFeatures) {
    const formatted = {};
    
    const features = ['acousticness', 'danceability', 'energy', 'instrumentalness', 
                     'liveness', 'loudness', 'speechiness', 'valence', 'tempo'];
    
    for (const feature of features) {
      if (audioFeatures[feature]) {
        const featureData = audioFeatures[feature];
        
        if (featureData.target !== undefined) {
          formatted[`target_${feature}`] = featureData.target;
        }
        if (featureData.min !== undefined) {
          formatted[`min_${feature}`] = featureData.min;
        }
        if (featureData.max !== undefined) {
          formatted[`max_${feature}`] = featureData.max;
        }
      }
    }
    
    return formatted;
  }

  /**
   * Get available genre seeds from Spotify
   */
  async getAvailableGenreSeeds(accessToken) {
    try {
      const cacheKey = 'genre_seeds';
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;

      this.spotifyApi.setAccessToken(accessToken);
      const data = await this.spotifyApi.getAvailableGenreSeeds();
      
      const genres = data.body.genres;
      this.cache.set(cacheKey, genres, 86400); // Cache for 24 hours
      
      return genres;
    } catch (error) {
      logger.error('Error getting available genre seeds:', error);
      return []; // Return empty array on error
    }
  }

  /**
   * Get user's playlists
   */
  async getUserPlaylists(accessToken, limit = 50, offset = 0) {
    try {
      this.spotifyApi.setAccessToken(accessToken);
      const data = await this.spotifyApi.getUserPlaylists({ limit, offset });
      
      return data.body.items.map(playlist => ({
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        public: playlist.public,
        collaborative: playlist.collaborative,
        owner: playlist.owner,
        tracks: playlist.tracks,
        images: playlist.images || [],
        uri: playlist.uri,
        externalUrls: playlist.external_urls
      }));
    } catch (error) {
      logger.error('Error getting user playlists:', error);
      throw new Error('Failed to get user playlists');
    }
  }

  /**
   * Validate and refresh user's Spotify token if needed
   */
  async ensureValidToken(user) {
    try {
      if (!user.isTokenExpired()) {
        return user.tokens.accessToken;
      }

      logger.info('Refreshing expired Spotify token', { userId: user._id });
      
      const newTokens = await this.refreshAccessToken(user.tokens.refreshToken);
      
      // Update user tokens
      user.tokens.accessToken = newTokens.accessToken;
      user.tokens.expiresAt = newTokens.expiresAt;
      if (newTokens.refreshToken) {
        user.tokens.refreshToken = newTokens.refreshToken;
      }
      
      await user.save();
      
      return newTokens.accessToken;
    } catch (error) {
      logger.error('Error ensuring valid token:', error);
      throw new Error('Failed to refresh access token');
    }
  }

  /**
   * Utility function to chunk arrays
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Clear caches
   */
  clearCache() {
    this.cache.flushAll();
    logger.info('Spotify service caches cleared');
  }
}

module.exports = new SpotifyService();