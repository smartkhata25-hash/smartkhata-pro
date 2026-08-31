// src/components/PermissionRoute.js

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { canAccess, getStoredUser, isStaffBlocked } from '../utils/permissionHelper';

const PermissionRoute = ({
  children,
  permission = null,
  anyPermissions = [],
  allPermissions = [],
  ownerOnly = false,
  systemAdminOnly = false,
  moduleKey = null,
  module = null,
  redirectTo = '/dashboard',
  fallback = null,
}) => {
  const location = useLocation();
  const user = getStoredUser();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (isStaffBlocked(user)) {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('user');
    localStorage.removeItem('mode');

    return (
      <Navigate
        to="/login"
        state={{
          from: location,
          message: 'Your staff account has been blocked',
        }}
        replace
      />
    );
  }

  const allowed = canAccess({
    permission,
    anyPermissions,
    allPermissions,
    ownerOnly,
    systemAdminOnly,
    moduleKey,
    module,
    user,
  });

  if (!allowed) {
    if (fallback) {
      return fallback;
    }

    return (
      <Navigate
        to={redirectTo}
        state={{
          from: location,
          permissionDenied: true,
        }}
        replace
      />
    );
  }

  return children;
};

export default PermissionRoute;
