import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'md', className = '' }) => {
  const spinnerStyle: React.CSSProperties = {
    width: size === 'sm' ? '16px' : size === 'lg' ? '48px' : '32px',
    height: size === 'sm' ? '16px' : size === 'lg' ? '48px' : '32px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #3498db',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    display: 'inline-block'
  };

  return (
    <div>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <div style={spinnerStyle} className={className} role="status" aria-label="Loading">
        <span style={{ 
          position: 'absolute', 
          width: '1px', 
          height: '1px', 
          padding: 0, 
          margin: '-1px', 
          overflow: 'hidden', 
          clip: 'rect(0, 0, 0, 0)', 
          border: 0 
        }}>
          Loading...
        </span>
      </div>
    </div>
  );
};

export default LoadingSpinner;