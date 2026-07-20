import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

type Role = 'superadmin' | 'admin' | 'reseller' | 'user';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** If provided, user must have one of these roles or they are redirected to /dashboard */
  roles?: Role[];
  /** Also allow resellers with the ccAccess delegate flag, even if not in `roles` */
  allowCC?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, roles, allowCC }) => {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '12px',
          background: '#f8fafc',
          color: '#334155',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        <div
          style={{
            width: '36px',
            height: '36px',
            border: '3px solid #cbd5e1',
            borderTopColor: '#2563eb',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <div style={{ fontSize: '14px', fontWeight: 600 }}>Checking session...</div>
        <style>
          {`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}
        </style>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Superadmin belongs only in /superadmin — bounce them out of the main portal
  if (user?.role === 'superadmin' && (!roles || !roles.includes('superadmin'))) {
    return <Navigate to="/superadmin" replace />;
  }

  if (roles && user && !roles.includes(user.role as Role)) {
    if (allowCC && user.role === 'reseller' && user.ccAccess) return <>{children}</>;
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
