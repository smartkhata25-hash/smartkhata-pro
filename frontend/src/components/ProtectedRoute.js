import { Navigate, useLocation } from 'react-router-dom';
import { hasPermission } from '../utils/permissionHelper';

export default function ProtectedRoute({ children, permission = null }) {
  const location = useLocation();

  const token = localStorage.getItem('token');
  const userId = localStorage.getItem('userId');

  if (!token || !userId) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Current User
  let user = null;

  try {
    user = JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    user = {};
  }

  // Deleted / Inactive Staff
  if (user?.isActive === false) {
    localStorage.clear();
    return <Navigate to="/login" replace />;
  }

  // Blocked Staff
  if (user?.status === 'blocked') {
    localStorage.clear();
    return <Navigate to="/login" replace />;
  }

  // Permission Check
  if (permission && !hasPermission(permission)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
