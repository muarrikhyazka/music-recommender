export interface User {
  id: string;
  displayName: string;
  email: string;
  spotifyId: string;
  images?: SpotifyImage[];
  preferences?: UserPreferences;
  createdAt?: string;
}

export interface UserPreferences {
  autoCreatePlaylists: boolean;
  enableLocationTracking: boolean;
  defaultRegion?: string;
  language: string;
  avoidExplicit?: boolean;
}

export interface SpotifyImage {
  url: string;
  height?: number;
  width?: number;
}

export interface Context {
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  weather?: {
    condition: string;
    temperature: number;
    description?: string;
  };
  location?: {
    city: string;
    country: string;
    timezone?: string;
  };
  season?: 'spring' | 'summer' | 'autumn' | 'winter';
  timestamp?: string;
}

export interface Track {
  id: string;
  name: string;
  artists: Artist[];
  album?: string;
  duration?: number;
  popularity?: number;
  previewUrl?: string;
  uri?: string;
  explicit?: boolean;
  score?: number;
  reasons?: string[];
}

export interface Artist {
  id: string;
  name: string;
  uri?: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  spotifyId?: string;
  spotifyUrl?: string;
  trackCount: number;
  context?: Context;
  createdAt: string;
  tracks?: Track[];
  stats?: PlaylistStats;
}

export interface PlaylistStats {
  plays: number;
  skips: number;
  saves: number;
  shares: number;
}

export interface RecommendationResult {
  recommendations: Track[];
  metadata: {
    recId: string;
    processingTime: number;
    confidence: number;
    playlistName: string;
    playlistDescription: string;
    appliedRules: AppliedRule[];
    diversity: DiversityStats;
  };
}

export interface AppliedRule {
  ruleId: string;
  name: string;
  weight: number;
  matchScore: number;
}

export interface DiversityStats {
  artistCount: number;
  genreCount: number;
  tempoVariance: number;
  moodVariance: number;
}

export interface PlaylistCreationResult {
  success: boolean;
  playlist?: {
    id: string;
    spotifyId: string;
    name: string;
    description: string;
    trackCount: number;
    spotifyUrl: string;
    tracks: Track[];
    context: Context;
  };
  metadata?: {
    recId: string;
    totalProcessingTime: number;
    confidence: number;
    createdAt: string;
  };
  error?: string;
  fallback?: FallbackOption[];
}

export interface FallbackOption {
  type: string;
  title: string;
  description: string;
  action: string;
  url?: string;
  query?: string;
}

export interface PreviewResult {
  success: boolean;
  preview?: {
    name: string;
    description: string;
    trackCount: number;
    tracks: Track[];
    context: Context;
    confidence: number;
    processingTime: number;
  };
  metadata?: {
    recId: string;
    canCreate: boolean;
    estimatedCreationTime: number;
  };
  error?: string;
}

export interface UserStats {
  period: string;
  totalSessions: number;
  totalListeningTime: number;
  completedSongs: number;
  skippedSongs: number;
  completionRate: number;
  topTracks: TopTrack[];
  listeningPatterns: ListeningPattern[];
  skipPatterns: SkipPattern[];
}

export interface TopTrack {
  song: {
    title: string;
    artist: string;
  };
  playCount: number;
  totalDuration: number;
  lastPlayed: string;
}

export interface ListeningPattern {
  _id: {
    timeOfDay: string;
    weather: string;
  };
  count: number;
  avgDuration: number;
  completionRate: number;
}

export interface SkipPattern {
  _id: string;
  count: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface LoadingState {
  loading: boolean;
  error: string | null;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
}

export interface AppState {
  auth: AuthState;
  context: Context | null;
  playlists: Playlist[];
  currentPlaylist: Playlist | null;
  loading: LoadingState;
}