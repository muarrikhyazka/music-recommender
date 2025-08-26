import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

class ApiService {
  private api: AxiosInstance;
  private baseURL: string;

  constructor() {
    this.baseURL = process.env.REACT_APP_API_URL || '/api';
    
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor - add auth token
    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('auth_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor - handle common errors
    this.api.interceptors.response.use(
      (response: AxiosResponse) => response,
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          
          // Token might be expired, try to refresh
          try {
            await this.refreshToken();
            const newToken = localStorage.getItem('auth_token');
            if (newToken) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              return this.api(originalRequest);
            }
          } catch (refreshError) {
            // Refresh failed, redirect to login
            this.clearAuth();
            window.location.href = '/login';
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private async refreshToken(): Promise<void> {
    const response = await this.api.post('/auth/refresh');
    const { token } = response.data;
    localStorage.setItem('auth_token', token);
  }

  private clearAuth(): void {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
  }

  // Generic request methods
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.api.get<T>(url, config);
    return response.data;
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.api.post<T>(url, data, config);
    return response.data;
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.api.put<T>(url, data, config);
    return response.data;
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.api.delete<T>(url, config);
    return response.data;
  }

  // Auth methods
  async getSpotifyAuthUrl(): Promise<{ authUrl: string; state: string }> {
    return this.get('/auth/spotify');
  }

  async getCurrentUser(): Promise<any> {
    return this.get('/auth/me');
  }

  async updateUserPreferences(preferences: any): Promise<any> {
    return this.put('/auth/preferences', { preferences });
  }

  async logout(): Promise<void> {
    await this.post('/auth/logout');
    this.clearAuth();
  }

  // Context methods
  async getCurrentContext(): Promise<any> {
    return this.get('/context/current');
  }

  async detectContext(data: any): Promise<any> {
    return this.post('/context/detect', data);
  }

  async getUserContextPatterns(days = 30): Promise<any> {
    return this.get(`/context/patterns?days=${days}`);
  }

  async submitMood(mood: string, confidence = 0.9): Promise<any> {
    return this.post('/context/mood', { mood, confidence });
  }

  // Recommendation methods
  async createPlaylist(options: {
    context?: any;
    userLocation?: any;
    targetLength?: number;
    diversityWeight?: number;
    isPublic?: boolean;
    forceCreate?: boolean;
  }): Promise<any> {
    return this.post('/recommendations/create', options);
  }

  async previewRecommendations(options: {
    context?: any;
    userLocation?: any;
    targetLength?: number;
    diversityWeight?: number;
  }): Promise<any> {
    return this.post('/recommendations/preview', options);
  }

  async recordFeedback(recId: string, data: {
    action: string;
    rating?: number;
    feedback?: any;
    trackData?: any;
  }): Promise<any> {
    return this.post(`/recommendations/${recId}/feedback`, data);
  }

  async getRecommendationHistory(limit = 20, offset = 0): Promise<any> {
    return this.get(`/recommendations/history?limit=${limit}&offset=${offset}`);
  }

  async getRecommendationAnalytics(days = 30): Promise<any> {
    return this.get(`/recommendations/analytics?days=${days}`);
  }

  // User methods
  async getUserProfile(): Promise<any> {
    return this.get('/user/profile');
  }

  async getUserPlaylists(limit = 20, offset = 0): Promise<any> {
    return this.get(`/user/playlists?limit=${limit}&offset=${offset}`);
  }

  async getUserStats(days = 30): Promise<any> {
    return this.get(`/user/listening-stats?days=${days}`);
  }

  async recordListeningHistory(data: {
    spotifyTrackId: string;
    playlistId?: string;
    duration?: number;
    completed?: boolean;
    skipped?: boolean;
    skipReason?: string;
    context?: any;
    sessionId?: string;
  }): Promise<any> {
    return this.post('/user/listening-history', data);
  }

  async deletePlaylist(playlistId: string): Promise<any> {
    return this.delete(`/user/playlist/${playlistId}`);
  }

  async exportUserData(): Promise<any> {
    return this.post('/user/export-data');
  }

  // Utility methods
  async getWeather(location: { lat: number; lng: number } | { city: string; country: string }): Promise<any> {
    const params = new URLSearchParams();
    if ('lat' in location) {
      params.set('lat', location.lat.toString());
      params.set('lng', location.lng.toString());
    } else {
      params.set('city', location.city);
      params.set('country', location.country);
    }
    
    return this.get(`/context/weather?${params.toString()}`);
  }

  // Health check
  async healthCheck(): Promise<any> {
    return this.get('/health');
  }

  // Get API instance for custom requests
  getApiInstance(): AxiosInstance {
    return this.api;
  }

  // Set auth token manually
  setAuthToken(token: string): void {
    localStorage.setItem('auth_token', token);
  }

  // Get current auth token
  getAuthToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return !!this.getAuthToken();
  }
}

export const apiService = new ApiService();
export default apiService;