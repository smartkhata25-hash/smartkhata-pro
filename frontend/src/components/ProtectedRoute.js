import { Navigate } from 'react-router-dom';

export default function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');
  const lockEnabled = localStorage.getItem('lockEnabled');
  const isUnlocked = localStorage.getItem('isUnlocked');

  if (!token) {
    return <Navigate to="/login" />;
  }

  if (lockEnabled === 'true' && isUnlocked !== 'true') {
    return <Navigate to="/lock" />;
  }

  return children;
}
