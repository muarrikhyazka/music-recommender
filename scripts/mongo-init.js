// MongoDB initialization script for Munder
// This script runs when the MongoDB container starts for the first time

print('🎵 Initializing Munder Database...');

// Switch to the application database
db = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE || 'munder');

print('📝 Creating application user...');

// Create application user with read/write permissions
db.createUser({
  user: process.env.MONGO_ROOT_USERNAME || 'admin',
  pwd: process.env.MONGO_ROOT_PASSWORD || 'password123',
  roles: [
    {
      role: 'readWrite',
      db: process.env.MONGO_INITDB_DATABASE || 'munder'
    }
  ]
});

print('📊 Creating indexes for performance...');

// Users collection indexes
db.users.createIndex({ "spotifyId": 1 }, { unique: true });
db.users.createIndex({ "email": 1 }, { unique: true });
db.users.createIndex({ "createdAt": -1 });
db.users.createIndex({ "isActive": 1 });

// Songs collection indexes
db.songs.createIndex({ "spotifyId": 1 }, { unique: true });
db.songs.createIndex({ "artist": 1 });
db.songs.createIndex({ "genres": 1 });
db.songs.createIndex({ "moodTags": 1 });
db.songs.createIndex({ "contextTags": 1 });
db.songs.createIndex({ "popularity": -1 });
db.songs.createIndex({ "audioFeatures.valence": 1 });
db.songs.createIndex({ "audioFeatures.energy": 1 });
db.songs.createIndex({ "audioFeatures.danceability": 1 });

// Playlists collection indexes
db.playlists.createIndex({ "createdBy": 1, "createdAt": -1 });
db.playlists.createIndex({ "spotifyPlaylistId": 1 }, { unique: true });
db.playlists.createIndex({ "context.timeOfDay": 1 });
db.playlists.createIndex({ "context.weather": 1 });
db.playlists.createIndex({ "context.location.city": 1 });
db.playlists.createIndex({ "type": 1 });
db.playlists.createIndex({ "tags": 1 });

// Listening History collection indexes
db.listeninghistories.createIndex({ "userId": 1, "playedAt": -1 });
db.listeninghistories.createIndex({ "songId": 1 });
db.listeninghistories.createIndex({ "playlistId": 1 });
db.listeninghistories.createIndex({ "spotifyTrackId": 1 });
db.listeninghistories.createIndex({ "context.timeOfDay": 1 });
db.listeninghistories.createIndex({ "context.weather": 1 });
db.listeninghistories.createIndex({ "playedAt": -1 });
db.listeninghistories.createIndex({ "sessionId": 1 });

// Context Log collection indexes (with TTL)
db.contextlogs.createIndex({ "userId": 1, "timestamp": -1 });
db.contextlogs.createIndex({ "timeOfDay": 1 });
db.contextlogs.createIndex({ "weather.condition": 1 });
db.contextlogs.createIndex({ "geoLocation.city": 1 });
db.contextlogs.createIndex({ "geoLocation.country": 1 });
db.contextlogs.createIndex({ "season": 1 });
db.contextlogs.createIndex({ "moodDetected.primary": 1 });
// TTL index - automatically delete documents after 90 days
db.contextlogs.createIndex({ "timestamp": 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

// Recommendation Rules collection indexes
db.recommendationrules.createIndex({ "conditions.timeOfDay": 1 });
db.recommendationrules.createIndex({ "conditions.weather": 1 });
db.recommendationrules.createIndex({ "conditions.geoRegion.countries": 1 });
db.recommendationrules.createIndex({ "conditions.season": 1 });
db.recommendationrules.createIndex({ "priority": -1, "isActive": 1 });
db.recommendationrules.createIndex({ "effectiveness.successRate": -1 });

// Recommendation Log collection indexes (with TTL)
db.recommendationlogs.createIndex({ "userId": 1, "deliveredAt": -1 });
db.recommendationlogs.createIndex({ "deliveredAt": -1 });
db.recommendationlogs.createIndex({ "userInteraction.clicked": 1 });
db.recommendationlogs.createIndex({ "userInteraction.played": 1 });
db.recommendationlogs.createIndex({ "userInteraction.saved": 1 });
db.recommendationlogs.createIndex({ "recommendationType": 1 });
db.recommendationlogs.createIndex({ "abTestGroup": 1 });
// TTL index - automatically delete documents after 1 year
db.recommendationlogs.createIndex({ "deliveredAt": 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 });

print('🎯 Creating default recommendation rules...');

// Insert default recommendation rules
db.recommendationrules.insertMany([
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
    priority: 8,
    isActive: true,
    effectiveness: {
      appliedCount: 0,
      successRate: 0,
      avgRating: 0
    },
    createdAt: new Date(),
    updatedAt: new Date()
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
    priority: 9,
    isActive: true,
    effectiveness: {
      appliedCount: 0,
      successRate: 0,
      avgRating: 0
    },
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    ruleId: 'afternoon_work_focus',
    name: 'Afternoon Focus',
    description: 'Concentration music for afternoon work',
    conditions: {
      timeOfDay: ['afternoon'],
      activity: ['working', 'studying']
    },
    recommendations: {
      themes: [
        { name: 'focus_instrumental', weight: 3.0 },
        { name: 'ambient_work', weight: 2.5 }
      ],
      genres: [
        { name: 'instrumental', weight: 3.0 },
        { name: 'ambient', weight: 2.5 },
        { name: 'classical', weight: 2.0 },
        { name: 'electronic', weight: 1.5 }
      ],
      audioFeatures: {
        energy: { min: 0.3, max: 0.7, target: 0.5, weight: 1.5 },
        instrumentalness: { min: 0.7, max: 1.0, target: 0.9, weight: 3.0 },
        speechiness: { min: 0.0, max: 0.2, target: 0.05, weight: 2.0 }
      },
      moodTags: ['focused', 'calm', 'productive'],
      contextTags: ['afternoon', 'work', 'focus']
    },
    priority: 7,
    isActive: true,
    effectiveness: {
      appliedCount: 0,
      successRate: 0,
      avgRating: 0
    },
    createdAt: new Date(),
    updatedAt: new Date()
  }
]);

print('✅ Database initialization completed successfully!');
print('🎵 Munder is ready to rock!');