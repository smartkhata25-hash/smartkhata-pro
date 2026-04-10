import { useState } from 'react';
import { t } from '../i18n/i18n';

export default function ResetPassword() {
  const [form, setForm] = useState({
    email: '',
    otp: '',
    newPassword: '',
  });

  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async () => {
    if (!navigator.onLine) {
      alert(t('auth.internetRequired'));
      return;
    }
    try {
      const res = await fetch(`${process.env.REACT_APP_API_BASE_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (res.ok) {
        alert(t('auth.resetSuccess'));
        window.location.href = '/login';
      } else {
        alert(data.msg || t('common.error'));
      }
    } catch (err) {
      alert(t('common.serverError'));
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #eef2ff, #f8fafc)',
        padding: '20px',
      }}
    >
      {/* Card */}
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '420px',
          padding: '28px',
        }}
      >
        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h2 style={{ marginBottom: '5px' }}>SMART KHATA</h2>
          <p style={{ fontSize: '13px', color: '#6b7280' }}>{t('auth.resetPassword')}</p>
        </div>

        {/* Email */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>
            {t('email')}
          </label>
          <div style={{ position: 'relative' }}>
            <input
              className="input"
              placeholder={t('email')}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              style={{ width: '100%', paddingLeft: '35px' }}
            />
            <span
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#9ca3af',
              }}
            >
              📧
            </span>
          </div>
        </div>

        {/* OTP */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>
            {t('auth.otp')}
          </label>
          <div style={{ position: 'relative' }}>
            <input
              className="input"
              placeholder={t('auth.enterOtp')}
              onChange={(e) => setForm({ ...form, otp: e.target.value })}
              style={{ width: '100%', paddingLeft: '35px' }}
            />
            <span
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#9ca3af',
              }}
            >
              🔢
            </span>
          </div>
        </div>

        {/* New Password */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>
            {t('password')}
          </label>

          <div style={{ position: 'relative' }}>
            <input
              className="input"
              type={showPassword ? 'text' : 'password'}
              placeholder={t('password')}
              onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
              style={{ width: '100%', paddingLeft: '35px', paddingRight: '35px' }}
            />

            {/* Lock Icon */}
            <span
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#9ca3af',
              }}
            >
              🔒
            </span>

            {/* Eye Toggle */}
            <span
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                cursor: 'pointer',
                color: '#6b7280',
              }}
            >
              {showPassword ? '🙈' : '👁'}
            </span>
          </div>
        </div>

        {/* Button */}
        <button
          onClick={handleSubmit}
          className="btn btn-primary"
          style={{
            width: '100%',
            padding: '10px',
            fontWeight: '600',
            fontSize: '15px',
          }}
        >
          {t('auth.resetPassword')}
        </button>

        {/* Back to Login */}
        <div
          style={{
            marginTop: '16px',
            textAlign: 'center',
            fontSize: '13px',
          }}
        >
          <a href="/login" style={{ color: '#2563eb' }}>
            {t('auth.backToLogin')}
          </a>
        </div>
      </div>
    </div>
  );
}
