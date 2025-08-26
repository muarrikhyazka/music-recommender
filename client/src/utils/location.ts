export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  city?: string;
  country?: string;
}

export interface GeolocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

class LocationService {
  private static instance: LocationService;
  private currentLocation: LocationData | null = null;
  private locationWatchers: Map<string, number> = new Map();

  static getInstance(): LocationService {
    if (!LocationService.instance) {
      LocationService.instance = new LocationService();
    }
    return LocationService.instance;
  }

  /**
   * Get current position using browser geolocation API
   */
  async getCurrentPosition(options: GeolocationOptions = {}): Promise<LocationData> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser'));
        return;
      }

      const defaultOptions: PositionOptions = {
        enableHighAccuracy: options.enableHighAccuracy ?? false,
        timeout: options.timeout ?? 10000,
        maximumAge: options.maximumAge ?? 300000 // 5 minutes
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const locationData: LocationData = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          };

          this.currentLocation = locationData;
          resolve(locationData);
        },
        (error) => {
          let errorMessage = 'Unable to retrieve location';
          
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Location access denied by user';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Location information unavailable';
              break;
            case error.TIMEOUT:
              errorMessage = 'Location request timed out';
              break;
          }
          
          reject(new Error(errorMessage));
        },
        defaultOptions
      );
    });
  }

  /**
   * Watch position changes
   */
  watchPosition(
    callback: (location: LocationData) => void,
    errorCallback: (error: Error) => void,
    options: GeolocationOptions = {}
  ): string {
    if (!navigator.geolocation) {
      errorCallback(new Error('Geolocation is not supported by this browser'));
      return '';
    }

    const watchId = Math.random().toString(36).substring(2);
    
    const defaultOptions: PositionOptions = {
      enableHighAccuracy: options.enableHighAccuracy ?? false,
      timeout: options.timeout ?? 10000,
      maximumAge: options.maximumAge ?? 60000 // 1 minute for watching
    };

    const navigatorWatchId = navigator.geolocation.watchPosition(
      (position) => {
        const locationData: LocationData = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        };

        this.currentLocation = locationData;
        callback(locationData);
      },
      (error) => {
        let errorMessage = 'Unable to watch location';
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location access denied';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location unavailable';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location watch timeout';
            break;
        }
        
        errorCallback(new Error(errorMessage));
      },
      defaultOptions
    );

    this.locationWatchers.set(watchId, navigatorWatchId);
    return watchId;
  }

  /**
   * Stop watching position
   */
  clearWatch(watchId: string): void {
    const navigatorWatchId = this.locationWatchers.get(watchId);
    if (navigatorWatchId !== undefined) {
      navigator.geolocation.clearWatch(navigatorWatchId);
      this.locationWatchers.delete(watchId);
    }
  }

  /**
   * Get cached location if available
   */
  getCachedLocation(): LocationData | null {
    return this.currentLocation;
  }

  /**
   * Calculate distance between two points (Haversine formula)
   */
  calculateDistance(
    lat1: number, 
    lng1: number, 
    lat2: number, 
    lng2: number
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Check if location permission is granted
   */
  async checkPermission(): Promise<string> {
    if (!navigator.permissions) {
      return 'unavailable';
    }

    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      return permission.state;
    } catch (error) {
      return 'unavailable';
    }
  }

  /**
   * Request location permission
   */
  async requestPermission(): Promise<boolean> {
    try {
      await this.getCurrentPosition({ timeout: 5000 });
      return true;
    } catch (error) {
      return false;
    }
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Format coordinates for display
   */
  formatCoordinates(lat: number, lng: number, precision = 4): string {
    return `${lat.toFixed(precision)}, ${lng.toFixed(precision)}`;
  }

  /**
   * Get location from IP (fallback when geolocation is not available)
   */
  async getLocationFromIP(): Promise<LocationData> {
    try {
      const response = await fetch('https://ipapi.co/json/');
      const data = await response.json();
      
      return {
        latitude: data.latitude,
        longitude: data.longitude,
        city: data.city,
        country: data.country_name
      };
    } catch (error) {
      throw new Error('Failed to get location from IP');
    }
  }

  /**
   * Get user-friendly location string
   */
  getLocationString(location: LocationData): string {
    if (location.city && location.country) {
      return `${location.city}, ${location.country}`;
    }
    return this.formatCoordinates(location.latitude, location.longitude);
  }

  /**
   * Check if browser supports geolocation
   */
  isSupported(): boolean {
    return 'geolocation' in navigator;
  }
}

export const locationService = LocationService.getInstance();
export default locationService;