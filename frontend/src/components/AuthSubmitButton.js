import React from 'react';

const AuthSubmitButton = ({
  loading = false,
  idleLabel,
  loadingLabel,
  disabled = false,
  className = '',
  style,
  ...buttonProps
}) => (
  <button
    {...buttonProps}
    disabled={disabled || loading}
    aria-busy={loading}
    className={`${className} auth-submit-button`.trim()}
    style={style}
  >
    {loading && <span className="auth-submit-button__spinner" aria-hidden="true" />}
    <span>{loading ? loadingLabel : idleLabel}</span>
  </button>
);

export default AuthSubmitButton;
