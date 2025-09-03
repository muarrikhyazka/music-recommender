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
    const token = localStorage.getItem('auth_token');
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
  }

  async get(endpoint: string): Promise<any> {
    return this.makeRequest(endpoint, { 
      method: 'GET',
      headers: this.getAuthHeaders()
    });
  }

  private async makeRequest(endpoint: string, options: RequestInit, retryCount = 0): Promise<any> {
    try {
      const response = await fetch(`/api${endpoint}`, options);
      
      // Handle rate limiting with exponential backoff
      if (response.status === 429 && retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        console.log(`Rate limited. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.makeRequest(endpoint, options, retryCount + 1);
      }
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }
      
      return response.json();
    } catch (error) {
      if (retryCount < 2 && error instanceof TypeError) {
        // Network error, retry once
        console.log('Network error, retrying...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.makeRequest(endpoint, options, retryCount + 1);
      }
      throw error;
    }
  }
  
  async post(endpoint: string, data?: any): Promise<any> {
    return this.makeRequest(endpoint, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: data ? JSON.stringify(data) : undefined
    });
  }
  
  async put(endpoint: string, data?: any): Promise<any> {
    return this.makeRequest(endpoint, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: data ? JSON.stringify(data) : undefined
    });
  }
  
  async delete(endpoint: string): Promise<any> {
    return this.makeRequest(endpoint, {
      method: 'DELETE',
      headers: this.getAuthHeaders()
    });
  }

  // Context and recommendation endpoints
  async getCurrentContext(userLocation?: { latitude: number; longitude: number }): Promise<ContextData> {
    // Build query parameters for GET request
    const params = new URLSearchParams();
    if (userLocation) {
      params.append('lat', userLocation.latitude.toString());
      params.append('lng', userLocation.longitude.toString());
    }
    
    const endpoint = `/context/current${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await this.get(endpoint);
    
    // The server returns { success: true, context: {...} }
    return response.context;
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