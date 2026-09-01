import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n/i18n';
import { updateStoredUser } from '../utils/permissionHelper';
import { FaBoxOpen, FaPlaneDeparture } from 'react-icons/fa';
import {
  DEFAULT_ENABLED_MODULES,
  MODULE_KEYS,
  normalizeDefaultModule,
  normalizeEnabledModules,
} from '../utils/moduleConfig';

export default function BusinessInfoForm() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    businessName: '',
    businessType: '',
    currency: '',
    taxNumber: '',
    enabledModules: { ...DEFAULT_ENABLED_MODULES },
    defaultModule: MODULE_KEYS.TRADING,
  });

  const [loading, setLoading] = useState(false);

  const businessTypes = ['Retail', 'Wholesale', 'Services', 'Manufacturing', 'Freelancing'];

  const currencies = ['PKR', 'USD', 'INR', 'SAR', 'AED'];

  const moduleOptions = [
    {
      key: MODULE_KEYS.TRADING,
      label: 'business.modules.trading',
      description: 'business.modules.tradingDescription',
      icon: FaBoxOpen,
    },
    {
      key: MODULE_KEYS.TRAVEL,
      label: 'business.modules.travel',
      description: 'business.modules.travelDescription',
      icon: FaPlaneDeparture,
    },
  ];

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch(`${process.env.REACT_APP_API_BASE_URL}/api/users/profile`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        });

        const data = await res.json();
        const enabledModules = normalizeEnabledModules(data.enabledModules);

        setForm({
          businessName: data.businessName || '',
          businessType: data.businessType || '',
          currency: data.currency || '',
          taxNumber: data.taxNumber || '',
          enabledModules,
          defaultModule: normalizeDefaultModule(data.defaultModule, enabledModules),
        });
      } catch (err) {
        console.log(err);
      }
    };

    fetchProfile();
  }, []);

  const handleModuleToggle = (moduleKey) => {
    const nextEnabledModules = {
      ...form.enabledModules,
      [moduleKey]: !form.enabledModules[moduleKey],
    };

    if (!Object.values(nextEnabledModules).some(Boolean)) {
      alert(t('business.modules.requireOne'));
      return;
    }

    setForm({
      ...form,
      enabledModules: nextEnabledModules,
      defaultModule: normalizeDefaultModule(form.defaultModule, nextEnabledModules),
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(`${process.env.REACT_APP_API_BASE_URL}/api/users/business-info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.msg || 'business_save_failed');
      }

      const enabledModules = normalizeEnabledModules(data.enabledModules || form.enabledModules);

      const defaultModule = normalizeDefaultModule(
        data.defaultModule || form.defaultModule,
        enabledModules
      );

      updateStoredUser({
        businessName: data.businessName || form.businessName,
        businessType: data.businessType || form.businessType,
        currency: data.currency || form.currency,
        taxNumber: data.taxNumber || form.taxNumber,
        enabledModules,
        defaultModule,
      });

      alert(t('business.saved'));

      if (defaultModule === MODULE_KEYS.TRAVEL) {
        navigate('/travel/dashboard', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch (error) {
      alert(t('alerts.businessSaveError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>
        {`
          .business-info-page {
            width: 100%;
            min-height: 100dvh;
            box-sizing: border-box;
            overflow-x: hidden;
          }

          .business-info-card {
            box-sizing: border-box;
          }

          .business-info-control {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
            font-size: 16px !important;
            color: #0f172a !important;
            background-color: #ffffff !important;
          }

          select.business-info-control {
            appearance: auto;
            -webkit-appearance: menulist;
            height: 46px;
            padding-right: 34px !important;
          }

          .business-info-actions {
            display: flex;
            gap: 10px;
          }

          .business-module-card:hover {
            transform: translateY(-1px);
          }

          @media (max-width: 600px) {
            .business-info-page {
              padding: 14px 10px 80px !important;
            }

            .business-info-card {
              width: 100% !important;
              max-width: 100% !important;
              padding: 18px 14px !important;
              border-radius: 18px !important;
            }

            .business-info-control {
              width: 100% !important;
              max-width: 100% !important;
              min-width: 0 !important;
            }

            select.business-info-control {
              display: block !important;
              width: 100% !important;
              min-width: 100% !important;
              max-width: 100% !important;
              height: 46px !important;
            }

            .business-module-card {
              flex-direction: column !important;
              align-items: stretch !important;
              gap: 12px !important;
            }

            .business-module-meta {
              width: 100%;
              justify-content: space-between !important;
            }

            .business-info-actions {
              flex-direction: column;
            }

            .business-info-actions button {
              width: 100% !important;
              min-height: 45px;
            }
          }

          @media (max-width: 380px) {
            .business-info-page {
              padding-left: 7px !important;
              padding-right: 7px !important;
            }

            .business-info-card {
              padding-left: 11px !important;
              padding-right: 11px !important;
            }
          }
        `}
      </style>

      <div
        className="business-info-page"
        style={{
          minHeight: '100dvh',
          background: 'linear-gradient(135deg, #e8efff 0%, #f8fafc 42%, #ecfeff 72%, #eff6ff 100%)',
          padding: '26px 14px 96px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
        }}
      >
        <div
          className="card business-info-card"
          style={{
            width: '100%',
            maxWidth: '580px',
            padding: '24px',
            borderRadius: '22px',
            border: '1px solid rgba(148, 163, 184, 0.28)',
            background:
              'linear-gradient(145deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 100%)',
            boxShadow: '0 20px 50px rgba(15, 23, 42, 0.10), 0 4px 12px rgba(37, 99, 235, 0.05)',
          }}
        >
          <div
            style={{
              marginBottom: '24px',
              textAlign: 'center',
              paddingBottom: '18px',
              borderBottom: '1px solid #eef2f7',
            }}
          >
            <div
              style={{
                width: '46px',
                height: '46px',
                margin: '0 auto 10px',
                borderRadius: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
                background: 'linear-gradient(135deg, #dbeafe 0%, #e0f2fe 50%, #dcfce7 100%)',
                boxShadow: '0 8px 18px rgba(37, 99, 235, 0.12)',
              }}
            >
              🏢
            </div>

            <h2
              style={{
                margin: '0 0 6px',
                fontSize: '21px',
                color: '#0f172a',
                fontWeight: 750,
              }}
            >
              {t('business.title')}
            </h2>

            <p
              style={{
                margin: 0,
                fontSize: '13px',
                color: '#64748b',
              }}
            >
              {t('business.setupDescription')}
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={fieldStyle}>
              <label style={labelStyle}>{t('business.name')}</label>

              <div style={inputWrapperStyle}>
                <input
                  className="input business-info-control"
                  value={form.businessName}
                  placeholder={t('business.name')}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      businessName: e.target.value,
                    })
                  }
                  required
                  style={inputWithIcon}
                />

                <span style={iconStyle}>🏢</span>
              </div>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>{t('business.selectType')}</label>

              <div style={inputWrapperStyle}>
                <select
                  className="input business-info-control"
                  value={form.businessType}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      businessType: e.target.value,
                    })
                  }
                  required
                  style={selectWithIcon}
                >
                  <option value="">{t('business.selectType')}</option>

                  {businessTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>

                <span style={iconStyle}>📊</span>
              </div>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>{t('business.selectCurrency')}</label>

              <div style={inputWrapperStyle}>
                <select
                  className="input business-info-control"
                  value={form.currency}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      currency: e.target.value,
                    })
                  }
                  required
                  style={selectWithIcon}
                >
                  <option value="">{t('business.selectCurrency')}</option>

                  {currencies.map((curr) => (
                    <option key={curr} value={curr}>
                      {curr}
                    </option>
                  ))}
                </select>

                <span style={iconStyle}>💱</span>
              </div>
            </div>

            <div style={{ ...fieldStyle, marginBottom: '20px' }}>
              <label style={labelStyle}>{t('business.taxOptional')}</label>

              <div style={inputWrapperStyle}>
                <input
                  className="input business-info-control"
                  value={form.taxNumber}
                  placeholder={t('business.taxOptional')}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      taxNumber: e.target.value,
                    })
                  }
                  style={inputWithIcon}
                />

                <span style={iconStyle}>🧾</span>
              </div>
            </div>

            <div style={moduleSectionStyle}>
              <div style={{ marginBottom: '13px' }}>
                <label
                  style={{
                    ...labelStyle,
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#0f172a',
                  }}
                >
                  {t('business.modules.title')}
                </label>

                <p style={moduleHelpStyle}>{t('business.modules.description')}</p>
              </div>

              <div
                style={{
                  display: 'grid',
                  gap: '11px',
                }}
              >
                {moduleOptions.map((moduleOption) => {
                  const isEnabled = Boolean(form.enabledModules[moduleOption.key]);

                  const ModuleIcon = moduleOption.icon;

                  return (
                    <label
                      key={moduleOption.key}
                      className="business-module-card"
                      style={moduleCardStyle(isEnabled)}
                    >
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={() => handleModuleToggle(moduleOption.key)}
                        className="sr-only"
                      />

                      <span style={moduleCardMainStyle}>
                        <span style={moduleIconStyle(isEnabled)}>
                          <ModuleIcon aria-hidden="true" />
                        </span>

                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
                          <span style={moduleTitleStyle}>{t(moduleOption.label)}</span>

                          <span style={moduleHelpStyle}>{t(moduleOption.description)}</span>
                        </span>
                      </span>

                      <span className="business-module-meta" style={moduleMetaStyle}>
                        <span style={moduleStatusStyle(isEnabled)}>
                          {isEnabled
                            ? t('business.modules.enabled')
                            : t('business.modules.disabled')}
                        </span>

                        <span style={switchTrackStyle(isEnabled)}>
                          <span style={switchThumbStyle} />
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={labelStyle}>{t('business.modules.default')}</label>

                <div style={inputWrapperStyle}>
                  <select
                    className="input business-info-control"
                    value={form.defaultModule}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        defaultModule: normalizeDefaultModule(e.target.value, form.enabledModules),
                      })
                    }
                    style={defaultModuleSelectStyle}
                  >
                    {moduleOptions
                      .filter((moduleOption) => form.enabledModules[moduleOption.key])
                      .map((moduleOption) => (
                        <option key={moduleOption.key} value={moduleOption.key}>
                          {t(moduleOption.label)}
                        </option>
                      ))}
                  </select>

                  <span style={iconStyle}>🧩</span>
                </div>
              </div>
            </div>

            <div className="business-info-actions" style={actionRowStyle}>
              <button
                type="button"
                onClick={() => navigate('/personal-info')}
                className="btn"
                style={{
                  flex: 1,
                  minHeight: '44px',
                  borderRadius: '10px',
                  border: '1px solid #dbe3ee',
                  background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
                  color: '#334155',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ⬅️ {t('common.back')}
              </button>

              <button
                type="submit"
                className="btn btn-primary"
                style={{
                  flex: 1,
                  minHeight: '44px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 48%, #0891b2 100%)',
                  color: '#ffffff',
                  fontWeight: 700,
                  boxShadow: '0 8px 18px rgba(37, 99, 235, 0.22)',
                  opacity: loading ? 0.7 : 1,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
                disabled={loading}
              >
                {loading ? t('common.saving') : t('common.saveChanges')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

const fieldStyle = {
  marginBottom: '14px',
};

const inputWrapperStyle = {
  position: 'relative',
  width: '100%',
  minWidth: 0,
};

const iconStyle = {
  position: 'absolute',
  left: '12px',
  top: '50%',
  transform: 'translateY(-50%)',
  color: '#94a3b8',
  fontSize: '15px',
  pointerEvents: 'none',
  zIndex: 2,
};

const labelStyle = {
  fontSize: '13px',
  marginBottom: '6px',
  display: 'block',
  color: '#334155',
  fontWeight: 500,
};

const inputWithIcon = {
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  height: '46px',
  paddingLeft: '38px',
  paddingRight: '12px',
  borderRadius: '10px',
  boxSizing: 'border-box',
  background: '#ffffff',
  border: '1px solid #dbe3ee',
  outline: 'none',
};

const selectWithIcon = {
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  height: '46px',
  paddingLeft: '38px',
  paddingRight: '34px',
  borderRadius: '10px',
  boxSizing: 'border-box',
  backgroundColor: '#ffffff',
  border: '1px solid #dbe3ee',
  color: '#0f172a',
  outline: 'none',
};

const defaultModuleSelectStyle = {
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  height: '46px',
  paddingLeft: '38px',
  paddingRight: '34px',
  borderRadius: '10px',
  boxSizing: 'border-box',
  backgroundColor: '#ffffff',
  border: '1px solid #cbd5e1',
  color: '#0f172a',
  outline: 'none',
};

const moduleSectionStyle = {
  marginBottom: '20px',
  padding: '15px',
  border: '1px solid #dbe7f5',
  borderRadius: '15px',
  background: 'linear-gradient(145deg, #f8fbff 0%, #ffffff 55%, #f0fdfa 100%)',
  boxShadow: '0 8px 25px rgba(15, 23, 42, 0.045)',
};

const moduleCardStyle = (isEnabled) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '13px',
  border: `1px solid ${isEnabled ? '#7dd3fc' : '#e2e8f0'}`,
  borderRadius: '13px',
  background: isEnabled
    ? 'linear-gradient(135deg, #eff6ff 0%, #ffffff 52%, #ecfeff 100%)'
    : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
  boxShadow: isEnabled ? '0 8px 22px rgba(37, 99, 235, 0.10)' : '0 2px 8px rgba(15, 23, 42, 0.035)',
  cursor: 'pointer',
  transition: 'border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease',
});

const moduleCardMainStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '11px',
  minWidth: 0,
  flex: 1,
};

const moduleIconStyle = (isEnabled) => ({
  width: '38px',
  height: '38px',
  borderRadius: '11px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: isEnabled ? '#1d4ed8' : '#64748b',
  background: isEnabled ? 'linear-gradient(135deg, #dbeafe 0%, #e0f2fe 100%)' : '#f1f5f9',
  fontSize: '16px',
  flexShrink: 0,
  boxShadow: isEnabled ? '0 5px 12px rgba(37, 99, 235, 0.09)' : 'none',
});

const moduleTitleStyle = {
  display: 'block',
  fontWeight: 700,
  color: '#0f172a',
  fontSize: '14px',
  lineHeight: 1.3,
  marginBottom: '3px',
};

const moduleMetaStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '9px',
  flexShrink: 0,
};

const moduleStatusStyle = (isEnabled) => ({
  fontSize: '11px',
  fontWeight: 700,
  color: isEnabled ? '#2563eb' : '#64748b',
});

const switchTrackStyle = (isEnabled) => ({
  width: '40px',
  height: '23px',
  borderRadius: '999px',
  background: isEnabled ? 'linear-gradient(135deg, #2563eb 0%, #06b6d4 100%)' : '#cbd5e1',
  padding: '2px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: isEnabled ? 'flex-end' : 'flex-start',
  transition: 'all 0.18s ease',
  boxSizing: 'border-box',
});

const switchThumbStyle = {
  width: '19px',
  height: '19px',
  borderRadius: '999px',
  background: '#ffffff',
  boxShadow: '0 2px 5px rgba(15, 23, 42, 0.22)',
};

const moduleHelpStyle = {
  margin: 0,
  display: 'block',
  fontSize: '12px',
  color: '#64748b',
  lineHeight: 1.4,
};

const actionRowStyle = {
  display: 'flex',
  gap: '10px',
  paddingTop: '3px',
};
