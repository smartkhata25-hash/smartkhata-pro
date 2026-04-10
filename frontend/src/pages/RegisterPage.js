import { useState } from 'react';
import { register } from '../services/authService';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n/i18n';

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '', code: '' });
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await register(form);
      alert(res.msg || t('alerts.registered'));

      if (res.msg === 'User registered successfully') {
        setForm({ name: '', email: '', password: '', code: '' });
        navigate('/login');
      }
    } catch (err) {
      alert(t('alerts.registrationFailed'));
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
          <p style={{ fontSize: '13px', color: '#6b7280' }}>{t('register')}</p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Name */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>
              {t('common.name')}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                type="text"
                placeholder={t('common.name')}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
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
                👤
              </span>
            </div>
          </div>

          {/* Email */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>
              {t('email')}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                type="email"
                placeholder={t('email')}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
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

          {/* Password */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>
              {t('password')}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                type={showPassword ? 'text' : 'password'}
                placeholder={t('password')}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                style={{ width: '100%', paddingLeft: '35px', paddingRight: '35px' }}
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
                🔒
              </span>

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

          {/* Invite Code */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>
              Invite Code
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                type="text"
                placeholder="Enter Invite Code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                required
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
                🎟
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
              fontWeight: '600',
              fontSize: '15px',
            }}
          >
            {t('register')}
          </button>
        </form>

        {/* Bottom Link */}
        <div
          style={{
            marginTop: '16px',
            textAlign: 'center',
            fontSize: '13px',
          }}
        >
          Already have an account?{' '}
          <a href="/login" style={{ color: '#2563eb' }}>
            Login
          </a>
        </div>
      </div>
    </div>
  );
}
