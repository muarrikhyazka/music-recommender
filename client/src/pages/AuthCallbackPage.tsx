import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/LoadingSpinner.tsx';

const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const handleCallback = () => {
      const token = searchParams.get('token');
      const userParam = searchParams.get('user');
      const error = searchParams.get('error');

      if (error) {
        console.error('Authentication error:', error);
        toast.error(`Authentication failed: ${error}`);
        navigate('/login');
        return;
      }

      if (token && userParam) {
        try {
          const user = JSON.parse(decodeURIComponent(userParam));
          
          // Use the global handler from AuthContext
          if ((window as any).__handleLoginSuccess) {
            (window as any).__handleLoginSuccess(user, token);
            navigate('/dashboard');
          } else {
            // Fallback: store directly and redirect
            localStorage.setItem('auth_token', token);
            localStorage.setItem('user', JSON.stringify(user));
            toast.success(`Welcome back, ${user.displayName}!`);
            navigate('/dashboard');
          }
        } catch (parseError) {
          console.error('Failed to parse user data:', parseError);
          toast.error('Authentication failed: Invalid user data');
          navigate('/login');
        }
      } else {
        console.error('Missing token or user data');
        toast.error('Authentication failed: Missing required data');
        navigate('/login');
      }
    };

    handleCallback();
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="text-center">
        <LoadingSpinner size="lg" />
        <h1 className="text-2xl font-bold text-white mt-6">Authenticating...</h1>
        <p className="text-gray-300 mt-2">Please wait while we log you in</p>
      </div>
    </div>
  );
};

export default AuthCallbackPage;