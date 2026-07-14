import { Navigate, useLocation } from 'react-router-dom';
import { hasPermission } from '../utils/permissionHelper';

export default function ProtectedRoute({ children, permission = null }) {
  const location = useLocation();

  const token = localStorage.getItem('token');
  const userId = localStorage.getItem('userId');

  if (!token || !userId) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Lock Settings
  let lockEnabled = localStorage.getItem(`lockEnabled_${userId}`);
  let isUnlocked = localStorage.getItem(`isUnlocked_${userId}`);

  if (lockEnabled === null) {
    localStorage.setItem(`lockEnabled_${userId}`, 'false');
    lockEnabled = 'false';
  }

  if (isUnlocked === null) {
    localStorage.setItem(`isUnlocked_${userId}`, 'false');
    isUnlocked = 'false';
  }

  if (lockEnabled === 'true' && isUnlocked !== 'true') {
    return <Navigate to="/lock" state={{ from: location }} replace />;
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
