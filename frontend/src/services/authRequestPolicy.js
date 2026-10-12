export const isPublicAuthenticationRequest = (url = '') =>
  /\/api\/auth\/(login|register|forgot-password|verify-otp|reset-password)(?:\?|$)/.test(
    String(url)
  );

export const shouldHandleSessionExpiry = (error = {}) => {
  const isAuthenticatedRequest = Boolean(
    error.config?.headers?.Authorization || error.config?.headers?.authorization
  );

  return (
    error.response?.status === 401 &&
    isAuthenticatedRequest &&
    !isPublicAuthenticationRequest(error.config?.url)
  );
};
