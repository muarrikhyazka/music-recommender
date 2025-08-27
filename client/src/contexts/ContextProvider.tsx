import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Context } from '../types';
import { apiService } from '../services/api';
import locationService, { LocationData } from '../utils/location';
import { useAuth } from './AuthContext.tsx';
import toast from 'react-hot-toast';

interface ContextState {
  context: Context | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

interface ContextProviderType extends ContextState {
  refreshContext: () => Promise<void>;
  updateLocation: (location: LocationData) => void;
  submitMood: (mood: string, confidence?: number) => Promise<void>;
  isStale: () => boolean;
}

const ContextContext = createContext<ContextProviderType | undefined>(undefined);

const CONTEXT_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
const CONTEXT_STALE_THRESHOLD = 10 * 60 * 1000; // 10 minutes

export const ContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [state, setState] = useState<ContextState>({
    context: null,
    loading: false,
    error: null,
    lastUpdated: null,
  });

  const [locationWatchId, setLocationWatchId] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<LocationData | null>(null);

  const refreshContext = useCallback(async () => {
    if (!user) return;

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Get location if available
      let location = currentLocation;
      if (!location) {
        try {
          location = await locationService.getCurrentPosition({
            enableHighAccuracy: false,
            timeout: 5000,
            maximumAge: 300000 // 5 minutes
          });
          setCurrentLocation(location);
        } catch (error) {
          console.warn('Could not get location:', error);
          // Continue without location
        }
      }

      // Build query parameters
      const params = new URLSearchParams();
      if (location) {
        params.set('lat', location.latitude.toString());
        params.set('lng', location.longitude.toString());
      }

      const response = await apiService.getCurrentContext();

      setState(prev => ({
        ...prev,
        context: response.context,
        loading: false,
        lastUpdated: new Date(),
      }));

    } catch (error: any) {
      console.error('Failed to fetch context:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.response?.data?.error || 'Failed to get context',
      }));
    }
  }, [user, currentLocation]);

  const updateLocation = useCallback((location: LocationData) => {
    setCurrentLocation(location);
    // Refresh context with new location
    refreshContext();
  }, [refreshContext]);

  const submitMood = useCallback(async (mood: string, confidence = 0.9) => {
    if (!user) return;

    try {
      await apiService.submitMood(mood, confidence);
      toast.success(`Mood updated to ${mood}`);
      
      // Refresh context to get updated mood data
      refreshContext();
    } catch (error: any) {
      console.error('Failed to submit mood:', error);
      toast.error('Failed to update mood');
    }
  }, [user, refreshContext]);

  const isStale = useCallback(() => {
    if (!state.lastUpdated) return true;
    return Date.now() - state.lastUpdated.getTime() > CONTEXT_STALE_THRESHOLD;
  }, [state.lastUpdated]);

  // Initialize context on user login
  useEffect(() => {
    if (user && !state.context) {
      refreshContext();
    }
  }, [user, refreshContext, state.context]);

  // Set up location watching if user enables location tracking
  useEffect(() => {
    if (user?.preferences?.enableLocationTracking && !locationWatchId) {
      const watchId = locationService.watchPosition(
        (location) => {
          setCurrentLocation(location);
        },
        (error) => {
          console.warn('Location watch error:', error);
        },
        {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 60000 // 1 minute
        }
      );
      
      setLocationWatchId(watchId);
    } else if (!user?.preferences?.enableLocationTracking && locationWatchId) {
      locationService.clearWatch(locationWatchId);
      setLocationWatchId(null);
    }

    return () => {
      if (locationWatchId) {
        locationService.clearWatch(locationWatchId);
      }
    };
  }, [user?.preferences?.enableLocationTracking, locationWatchId]);

  // Set up periodic context refresh
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      if (isStale()) {
        refreshContext();
      }
    }, CONTEXT_REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [user, isStale, refreshContext]);

  // Request location permission on first load if enabled
  useEffect(() => {
    const requestLocationPermission = async () => {
      if (user?.preferences?.enableLocationTracking && locationService.isSupported()) {
        try {
          const permission = await locationService.checkPermission();
          if (permission === 'prompt') {
            const granted = await locationService.requestPermission();
            if (granted) {
              toast.success('Location access granted');
            }
          }
        } catch (error) {
          console.warn('Location permission error:', error);
        }
      }
    };

    requestLocationPermission();
  }, [user?.preferences?.enableLocationTracking]);

  const value: ContextProviderType = {
    ...state,
    refreshContext,
    updateLocation,
    submitMood,
    isStale,
  };

  return (
    <ContextContext.Provider value={value}>
      {children}
    </ContextContext.Provider>
  );
};

export const useContext = (): ContextProviderType => {
  const context = useContext(ContextContext);
  if (context === undefined) {
    throw new Error('useContext must be used within a ContextProvider');
  }
  return context;
};