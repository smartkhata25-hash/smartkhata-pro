// src/components/PermissionGuard.js

import React from 'react';

import { canAccess, getStoredUser, isStaffBlocked } from '../utils/permissionHelper';

const PermissionGuard = ({
  children,
  permission = null,
  anyPermissions = [],
  allPermissions = [],
  ownerOnly = false,
  systemAdminOnly = false,
  fallback = null,
  hide = true,
  disabled = false,
}) => {
  const user = getStoredUser();

  const allowed =
    user &&
    !isStaffBlocked(user) &&
    canAccess({
      permission,
      anyPermissions,
      allPermissions,
      ownerOnly,
      systemAdminOnly,
      user,
    });

  if (allowed) {
    return children;
  }

  if (fallback !== null) {
    return fallback;
  }

  if (disabled && React.isValidElement(children)) {
    return React.cloneElement(children, {
      disabled: true,
      title: children.props?.title || 'You do not have permission to perform this action',
      onClick: undefined,
      style: {
        ...(children.props?.style || {}),
        opacity: 0.5,
        cursor: 'not-allowed',
      },
      className: `${children.props?.className || ''} opacity-50 cursor-not-allowed`,
    });
  }

  if (hide) {
    return null;
  }

  return children;
};

export default PermissionGuard;
