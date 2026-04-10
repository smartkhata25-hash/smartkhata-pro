import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login as loginUser } from '../services/authService';
import { t } from '../i18n/i18n';

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await loginUser(form);

      if (res.token && res.user) {
        localStorage.setItem('token', res.token);
        localStorage.setItem('userId', res.user._id);
        localStorage.setItem('user', JSON.stringify(res.user));
        localStorage.setItem('mode', res.mode);
        alert(t('alerts.loginSuccess'));

        const user = res.user;
        if (!user.fullName || !user.cnic || !user.mobile || !user.address) {
          navigate('/personal-info');
        } else if (!user.businessName || !user.businessType || !user.currency) {
          navigate('/business-info');
        } else {
          navigate('/dashboard');
        }
      } else {
        alert(res.msg || t('alerts.loginFailed'));
      }
    } catch (err) {
      console.error('Login error:', err);

      const msg = err?.response?.data?.msg;
      alert(msg || t('alerts.loginFailed'));
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
          borderRadius: '14px',
        }}
      >
        {/* Logo / Title */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h2 style={{ marginBottom: '5px' }}>SMART KHATA</h2>
          <p style={{ fontSize: '13px', color: '#6b7280' }}>{t('login')}</p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Email */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '13px', marginBottom: '4px', display: 'block' }}>
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
                  fontSize: '14px',
                  color: '#9ca3af',
                }}
              >
                📧
              </span>
            </div>
          </div>

          {/* Password */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '13px', marginBottom: '4px', display: 'block' }}>
              {t('password')}
            </label>

            <div style={{ position: 'relative' }}>
              <input
                className="input"
                type={showPassword ? 'text' : 'password'}
                placeholder={t('password')}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                style={{ width: '100%', paddingLeft: '35px', paddingRight: '35px' }}
              />

              {/* Lock Icon */}
              <span
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '14px',
                  color: '#9ca3af',
                }}
              >
                🔒
              </span>

              {/* Eye Icon */}
              <span
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: '#6b7280',
                }}
              >
                {showPassword ? '🙈' : '👁'}
              </span>
            </div>
          </div>

          {/* Button */}
          <button
            type="submit"
            className="btn btn-primary"
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '15px',
              fontWeight: '600',
            }}
          >
            {t('login')}
          </button>
        </form>

        {/* Links */}
        <div
          style={{
            marginTop: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '13px',
          }}
        >
          <a
            href="/forgot-password"
            style={{ color: '#2563eb' }}
            onClick={(e) => {
              if (!navigator.onLine) {
                e.preventDefault();
                alert(t('auth.internetRequired'));
              }
            }}
          >
            {t('auth.forgotPassword')}
          </a>

          <a href="/register" style={{ color: '#2563eb' }}>
            {t('auth.registerHere')}
          </a>
        </div>
      </div>
    </div>
  );
}
