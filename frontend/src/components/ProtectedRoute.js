import { Navigate, useLocation } from 'react-router-dom';

export default function ProtectedRoute({ children }) {
  const location = useLocation();

  const token = localStorage.getItem('token');
  const userId = localStorage.getItem('userId');

  const lockEnabled = localStorage.getItem(`lockEnabled_${userId}`);
  const isUnlocked = localStorage.getItem(`isUnlocked_${userId}`);

  console.log('--- ProtectedRoute CHECK ---');
  console.log('token:', token);
  console.log('userId:', userId);
  console.log('lockEnabled:', lockEnabled);
  console.log('isUnlocked:', isUnlocked);

  // 🔐 default values fix (important for new tabs)
  if (!localStorage.getItem(`isUnlocked_${userId}`)) {
    localStorage.setItem(`isUnlocked_${userId}`, 'false');
  }

  if (!localStorage.getItem(`lockEnabled_${userId}`)) {
    localStorage.setItem(`lockEnabled_${userId}`, 'false');
  }
  // ❌ No token → login
  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 🔒 Lock enabled but not unlocked → lock screen
  if (lockEnabled === 'true' && isUnlocked !== 'true') {
    return <Navigate to="/lock" state={{ from: location }} replace />;
  }

  return children;
}
