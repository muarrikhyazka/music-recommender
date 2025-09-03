// API service with authentication and recommendation endpoints
interface RecommendationRequest {
  context?: any;
  userLocation?: {
    latitude: number;
    longitude: number;
  };
  targetLength?: number;
  diversityWeight?: number;
}

interface WeatherData {
  condition: string;
  temperature: number;
  feelsLike?: number;
  humidity: number;
  description?: string;
}

interface LocationData {
  city: string;
  country: string;
  region?: string;
  coordinates: {
    lat: number;
    lng: number;
  };
}

interface ContextData {
  timestamp: string;
  timeOfDay: string;
  geoLocation: LocationData;
  weather: WeatherData;
  season: string;
}

interface Track {
  id: string;
  name: string;
  artists: Array<{ name: string; id: string }>;
  album: { name: string; images: Array<{ url: string }> };
  uri: string;
  duration?: number;
  score?: number;
  reasons?: string[];
}

interface RecommendationResponse {
  success: boolean;
  recommendations?: Track[];
  metadata?: {
    recId: string;
    playlistName: string;
    playlistDescription: string;
    confidence: number;
    processingTime: number;
  };
  error?: string;
}

class ApiService {
  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('authToken');
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
  }

  async get(endpoint: string): Promise<any> {
    const response = await fetch(`/api${endpoint}`, {
      headers: this.getAuthHeaders()
    });
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  async post(endpoint: string, data?: any): Promise<any> {
    const response = await fetch(`/api${endpoint}`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: data ? JSON.stringify(data) : undefined
    });
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  async put(endpoint: string, data?: any): Promise<any> {
    const response = await fetch(`/api${endpoint}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: data ? JSON.stringify(data) : undefined
    });
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  async delete(endpoint: string): Promise<any> {
    const response = await fetch(`/api${endpoint}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders()
    });
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }
    
    return response.json();
  }

  // Context and recommendation endpoints
  async getCurrentContext(userLocation?: { latitude: number; longitude: number }): Promise<ContextData> {
    return this.post('/context/current', { userLocation });
  }

  async previewRecommendations(request: RecommendationRequest): Promise<RecommendationResponse> {
    return this.post('/recommendations/preview', request);
  }

  async createRecommendationPlaylist(request: RecommendationRequest & { isPublic?: boolean }): Promise<RecommendationResponse> {
    return this.post('/recommendations/create', request);
  }

  async getRecommendationHistory(limit = 20): Promise<any> {
    return this.get(`/recommendations/history?limit=${limit}`);
  }

  async recordRecommendationFeedback(recId: string, action: string, data?: any): Promise<any> {
    return this.post(`/recommendations/${recId}/feedback`, { action, ...data });
  }
}

export const apiService = new ApiService();
export default apiService;