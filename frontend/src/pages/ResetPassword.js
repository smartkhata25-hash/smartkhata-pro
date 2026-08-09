import { useState } from 'react';
import { t } from '../i18n/i18n';

export default function ResetPassword() {
  const savedEmail = sessionStorage.getItem('resetPasswordEmail') || '';

  const [form, setForm] = useState({
    email: savedEmail,
    otp: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [resetToken, setResetToken] = useState(sessionStorage.getItem('resetPasswordToken') || '');

  const [otpVerified, setOtpVerified] = useState(Boolean(resetToken));

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleVerifyOtp = async () => {
    if (!navigator.onLine) {
      alert(t('auth.internetRequired'));
      return;
    }

    if (!form.email) {
      alert(t('auth.resetSessionExpired'));
      window.location.href = '/#/forgot-password';
      return;
    }

    const cleanOtp = form.otp.trim();

    if (!cleanOtp) {
      alert(t('auth.enterOtp'));
      return;
    }

    if (!/^\d{6}$/.test(cleanOtp)) {
      alert(t('auth.invalidOtpFormat'));
      return;
    }

    setVerifyingOtp(true);

    try {
      const res = await fetch(`${process.env.REACT_APP_API_BASE_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          otp: cleanOtp,
        }),
      });

      const data = await res.json();

      if (res.ok && data.resetToken) {
        sessionStorage.setItem('resetPasswordToken', data.resetToken);

        setResetToken(data.resetToken);
        setOtpVerified(true);

        alert(t('auth.otpVerified'));
      } else {
        alert(data.msg || t('common.error'));
      }
    } catch (err) {
      alert(t('common.serverError'));
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleSubmit = async () => {
    if (!navigator.onLine) {
      alert(t('auth.internetRequired'));
      return;
    }

    if (!form.email || !resetToken || !otpVerified) {
      alert(t('auth.resetSessionExpired'));
      window.location.href = '/#/forgot-password';
      return;
    }

    if (!form.newPassword || !form.confirmPassword) {
      alert(t('auth.enterNewPassword'));
      return;
    }

    if (form.newPassword.length < 6) {
      alert(t('auth.passwordMinLength'));
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      alert(t('auth.passwordsDoNotMatch'));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${process.env.REACT_APP_API_BASE_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          newPassword: form.newPassword,
          resetToken,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        sessionStorage.removeItem('resetPasswordEmail');
        sessionStorage.removeItem('resetPasswordToken');

        alert(t('auth.resetSuccess'));

        window.location.href = '/#/login';
      } else {
        alert(data.msg || t('common.error'));
      }
    } catch (err) {
      alert(t('common.serverError'));
    } finally {
      setLoading(false);
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
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '420px',
          padding: '28px',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h2 style={{ marginBottom: '5px' }}>SMART KHATA</h2>

          <p style={{ fontSize: '13px', color: '#6b7280' }}>{t('auth.resetPassword')}</p>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label
            style={{
              fontSize: '13px',
              display: 'block',
              marginBottom: '4px',
            }}
          >
            {t('email')}
          </label>

          <div style={{ position: 'relative' }}>
            <input
              className="input"
              type="email"
              value={form.email}
              readOnly
              style={{
                width: '100%',
                paddingLeft: '35px',
                backgroundColor: '#f3f4f6',
                cursor: 'not-allowed',
              }}
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

        {!otpVerified && (
          <>
            <div style={{ marginBottom: '16px' }}>
              <label
                style={{
                  fontSize: '13px',
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                {t('auth.verificationCode')}
              </label>

              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder={t('auth.enterOtp')}
                  value={form.otp}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      otp: e.target.value.replace(/\D/g, ''),
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !verifyingOtp) {
                      handleVerifyOtp();
                    }
                  }}
                  style={{
                    width: '100%',
                    paddingLeft: '35px',
                    letterSpacing: '4px',
                  }}
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

            <button
              type="button"
              onClick={handleVerifyOtp}
              disabled={verifyingOtp}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '10px',
                fontWeight: '600',
                fontSize: '15px',
                opacity: verifyingOtp ? 0.7 : 1,
                cursor: verifyingOtp ? 'not-allowed' : 'pointer',
              }}
            >
              {verifyingOtp ? t('auth.verifyingOtp') : t('auth.verifyOtp')}
            </button>
          </>
        )}

        {otpVerified && (
          <>
            <div
              style={{
                marginBottom: '14px',
                padding: '10px 12px',
                backgroundColor: '#ecfdf5',
                border: '1px solid #a7f3d0',
                borderRadius: '8px',
                fontSize: '13px',
                color: '#047857',
                textAlign: 'center',
              }}
            >
              {t('auth.otpVerified')}
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label
                style={{
                  fontSize: '13px',
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                {t('auth.newPassword')}
              </label>

              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('auth.enterNewPasswordPlaceholder')}
                  value={form.newPassword}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      newPassword: e.target.value,
                    })
                  }
                  style={{
                    width: '100%',
                    paddingLeft: '35px',
                    paddingRight: '40px',
                  }}
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

            <div style={{ marginBottom: '16px' }}>
              <label
                style={{
                  fontSize: '13px',
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                {t('auth.confirmPassword')}
              </label>

              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder={t('auth.confirmPasswordPlaceholder')}
                  value={form.confirmPassword}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      confirmPassword: e.target.value,
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !loading) {
                      handleSubmit();
                    }
                  }}
                  style={{
                    width: '100%',
                    paddingLeft: '35px',
                    paddingRight: '40px',
                  }}
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
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    cursor: 'pointer',
                    color: '#6b7280',
                  }}
                >
                  {showConfirmPassword ? '🙈' : '👁'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '10px',
                fontWeight: '600',
                fontSize: '15px',
                opacity: loading ? 0.7 : 1,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? t('auth.resettingPassword') : t('auth.resetPassword')}
            </button>
          </>
        )}

        <div
          style={{
            marginTop: '16px',
            textAlign: 'center',
            fontSize: '13px',
          }}
        >
          <a href="/#/login" style={{ color: '#2563eb' }}>
            {t('auth.backToLogin')}
          </a>
        </div>
      </div>
    </div>
  );
}
