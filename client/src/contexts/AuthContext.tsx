import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { User, AuthState } from '../types/index';
// import { apiService } from '../services/api'; // Temporarily disabled for build
import toast from 'react-hot-toast';

type AuthAction =
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; payload: { user: User; token: string } }
  | { type: 'LOGIN_FAILURE'; payload: string }
  | { type: 'LOGOUT' }
  | { type: 'UPDATE_USER'; payload: User }
  | { type: 'SET_LOADING'; payload: boolean };

interface AuthContextType extends AuthState {
  login: () => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const initialState: AuthState = {
  user: null,
  token: localStorage.getItem('auth_token'),
  loading: true,
  error: null,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN_START':
      return {
        ...state,
        loading: true,
        error: null,
      };
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        loading: false,
        error: null,
      };
    case 'LOGIN_FAILURE':
      return {
        ...state,
        user: null,
        token: null,
        loading: false,
        error: action.payload,
      };
    case 'LOGOUT':
      return {
        ...state,
        user: null,
        token: null,
        loading: false,
        error: null,
      };
    case 'UPDATE_USER':
      return {
        ...state,
        user: action.payload,
      };
    case 'SET_LOADING':
      return {
        ...state,
        loading: action.payload,
      };
    default:
      return state;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('auth_token');
      
      if (token) {
        try {
          dispatch({ type: 'SET_LOADING', payload: true });
          // const response = await apiService.getCurrentUser(); // Stub
          const response = { data: null };
          
          dispatch({
            type: 'LOGIN_SUCCESS',
            payload: {
              user: response.user,
              token,
            },
          });
        } catch (error) {
          console.error('Failed to fetch user data:', error);
          localStorage.removeItem('auth_token');
          localStorage.removeItem('user');
          dispatch({ type: 'LOGOUT' });
        }
      } else {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    initializeAuth();
  }, []);

  const login = async (): Promise<void> => {
    try {
      dispatch({ type: 'LOGIN_START' });
      
      // const response = await apiService.getSpotifyAuthUrl(); // Stub
      const response = { data: { authUrl: '/auth/spotify' } };
      window.location.href = response.authUrl;
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Login failed';
      dispatch({ type: 'LOGIN_FAILURE', payload: errorMessage });
      toast.error(errorMessage);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      // await apiService.logout(); // Stub
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      dispatch({ type: 'LOGOUT' });
      toast.success('Logged out successfully');
    }
  };

  const updateUser = (user: User): void => {
    dispatch({ type: 'UPDATE_USER', payload: user });
    localStorage.setItem('user', JSON.stringify(user));
  };

  const refreshUserData = async (): Promise<void> => {
    try {
      // const response = await apiService.getCurrentUser(); // Stub
          const response = { data: null };
      dispatch({ type: 'UPDATE_USER', payload: response.user });
    } catch (error) {
      console.error('Failed to refresh user data:', error);
      toast.error('Failed to refresh user data');
    }
  };

  // Handle successful login from callback
  const handleLoginSuccess = (user: User, token: string) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('user', JSON.stringify(user));
    dispatch({
      type: 'LOGIN_SUCCESS',
      payload: { user, token },
    });
    toast.success(`Welcome back, ${user.displayName}!`);
  };

  // Expose handleLoginSuccess for use in AuthCallback component
  React.useEffect(() => {
    (window as any).__handleLoginSuccess = handleLoginSuccess;
    
    return () => {
      delete (window as any).__handleLoginSuccess;
    };
  }, []);

  const value: AuthContextType = {
    ...state,
    login,
    logout,
    updateUser,
    refreshUserData,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};