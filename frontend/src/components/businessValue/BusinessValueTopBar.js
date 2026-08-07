import React, { useEffect, useMemo, useRef, useState } from 'react';

import { createPortal } from 'react-dom';

import { t } from '../../i18n/i18n';

import {
  BUSINESS_VALUE_COMPONENTS,
  BUSINESS_VALUE_PRESETS,
  formatBusinessValueAmount,
} from '../../services/businessValueService';

const COMPONENT_OPTIONS = [
  {
    key: BUSINESS_VALUE_COMPONENTS.INVENTORY,
    labelKey: 'businessValue.inventory',
    icon: '📦',
    effect: 'positive',
  },
  {
    key: BUSINESS_VALUE_COMPONENTS.ASSETS,
    labelKey: 'businessValue.assets',
    icon: '🏢',
    effect: 'positive',
  },
  {
    key: BUSINESS_VALUE_COMPONENTS.CASH,
    labelKey: 'businessValue.cash',
    icon: '💵',
    effect: 'positive',
  },
  {
    key: BUSINESS_VALUE_COMPONENTS.BANK,
    labelKey: 'businessValue.bank',
    icon: '🏦',
    effect: 'positive',
  },
  {
    key: BUSINESS_VALUE_COMPONENTS.RECEIVABLES,
    labelKey: 'businessValue.receivables',
    icon: '📥',
    effect: 'positive',
  },
  {
    key: BUSINESS_VALUE_COMPONENTS.PAYABLES,
    labelKey: 'businessValue.payables',
    icon: '📤',
    effect: 'negative',
  },
  {
    key: BUSINESS_VALUE_COMPONENTS.LIABILITIES,
    labelKey: 'businessValue.liabilities',
    icon: '💳',
    effect: 'negative',
  },
];

const PRESET_OPTIONS = [
  {
    key: BUSINESS_VALUE_PRESETS.STOCK_ASSETS,
    labelKey: 'businessValue.presetStockAssets',
    icon: '📦',
  },
  {
    key: BUSINESS_VALUE_PRESETS.OPERATIONAL,
    labelKey: 'businessValue.presetOperational',
    icon: '⚙️',
  },
  {
    key: BUSINESS_VALUE_PRESETS.COMPLETE,
    labelKey: 'businessValue.presetComplete',
    icon: '💼',
  },
  {
    key: BUSINESS_VALUE_PRESETS.CUSTOM,
    labelKey: 'businessValue.presetCustom',
    icon: '☑️',
  },
];

const PRESET_MENU_WIDTH = 360;
const COMPONENT_MENU_WIDTH = 390;

const BusinessValueTopBar = ({
  data,
  preset = BUSINESS_VALUE_PRESETS.COMPLETE,
  selectedComponents = [],
  loading = false,
  onPresetChange,
  onComponentsChange,
  onApply,
  onRefresh,
}) => {
  const presetButtonRef = useRef(null);
  const presetMenuRef = useRef(null);

  const componentButtonRef = useRef(null);
  const componentMenuRef = useRef(null);

  const [showPreset, setShowPreset] = useState(false);
  const [showComponents, setShowComponents] = useState(false);

  const [presetPosition, setPresetPosition] = useState({
    top: 0,
    left: 0,
  });

  const [componentPosition, setComponentPosition] = useState({
    top: 0,
    left: 0,
  });

  const selectedCount = selectedComponents.length;

  const netBusinessValue = Number(data?.netBusinessValue || 0);

  const totalPositiveValue = Number(data?.totalPositiveValue || 0);

  const totalNegativeValue = Number(data?.totalNegativeValue || 0);

  const allSelected = useMemo(() => {
    return COMPONENT_OPTIONS.every((option) => selectedComponents.includes(option.key));
  }, [selectedComponents]);

  const activePreset = useMemo(() => {
    return PRESET_OPTIONS.find((option) => option.key === preset) || PRESET_OPTIONS[2];
  }, [preset]);

  const getSafeLeft = (preferredLeft, menuWidth) => {
    const viewportWidth = window.innerWidth;
    const padding = 12;

    return Math.max(padding, Math.min(preferredLeft, viewportWidth - menuWidth - padding));
  };

  const updatePresetPosition = () => {
    if (!presetButtonRef.current) return;

    const rect = presetButtonRef.current.getBoundingClientRect();

    setPresetPosition({
      top: rect.bottom + 6,
      left: getSafeLeft(rect.left, PRESET_MENU_WIDTH),
    });
  };

  const updateComponentPosition = () => {
    if (!componentButtonRef.current) return;

    const rect = componentButtonRef.current.getBoundingClientRect();

    const preferredLeft = rect.right - COMPONENT_MENU_WIDTH;

    setComponentPosition({
      top: rect.bottom + 6,
      left: getSafeLeft(preferredLeft, COMPONENT_MENU_WIDTH),
    });
  };

  const openPresetDropdown = () => {
    if (loading) return;

    updatePresetPosition();

    setShowComponents(false);

    setShowPreset((current) => !current);
  };

  const openComponentsDropdown = () => {
    if (loading) return;

    updateComponentPosition();

    setShowPreset(false);

    setShowComponents((current) => !current);
  };

  useEffect(() => {
    const handleOutsideClick = (event) => {
      const clickedPresetButton = presetButtonRef.current?.contains(event.target);

      const clickedPresetMenu = presetMenuRef.current?.contains(event.target);

      const clickedComponentButton = componentButtonRef.current?.contains(event.target);

      const clickedComponentMenu = componentMenuRef.current?.contains(event.target);

      if (!clickedPresetButton && !clickedPresetMenu) {
        setShowPreset(false);
      }

      if (!clickedComponentButton && !clickedComponentMenu) {
        setShowComponents(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, []);

  useEffect(() => {
    if (!showPreset && !showComponents) {
      return undefined;
    }

    const getSafeLeftPosition = (preferredLeft, menuWidth) => {
      const viewportWidth = window.innerWidth;
      const padding = 12;

      return Math.max(padding, Math.min(preferredLeft, viewportWidth - menuWidth - padding));
    };

    const handlePositionUpdate = () => {
      if (showPreset && presetButtonRef.current) {
        const rect = presetButtonRef.current.getBoundingClientRect();

        setPresetPosition({
          top: rect.bottom + 6,
          left: getSafeLeftPosition(rect.left, PRESET_MENU_WIDTH),
        });
      }

      if (showComponents && componentButtonRef.current) {
        const rect = componentButtonRef.current.getBoundingClientRect();

        const preferredLeft = rect.right - COMPONENT_MENU_WIDTH;

        setComponentPosition({
          top: rect.bottom + 6,
          left: getSafeLeftPosition(preferredLeft, COMPONENT_MENU_WIDTH),
        });
      }
    };

    handlePositionUpdate();

    window.addEventListener('resize', handlePositionUpdate);

    window.addEventListener('scroll', handlePositionUpdate, true);

    return () => {
      window.removeEventListener('resize', handlePositionUpdate);

      window.removeEventListener('scroll', handlePositionUpdate, true);
    };
  }, [showPreset, showComponents]);

  const handlePresetSelect = (presetKey) => {
    if (onPresetChange) {
      onPresetChange(presetKey);
    }

    setShowPreset(false);
  };

  const toggleComponent = (componentKey) => {
    if (!onComponentsChange) return;

    const exists = selectedComponents.includes(componentKey);

    const nextComponents = exists
      ? selectedComponents.filter((item) => item !== componentKey)
      : [...selectedComponents, componentKey];

    onComponentsChange(nextComponents);
  };

  const toggleAll = () => {
    if (!onComponentsChange) return;

    if (allSelected) {
      onComponentsChange([]);
      return;
    }

    onComponentsChange(COMPONENT_OPTIONS.map((option) => option.key));
  };

  return (
    <>
      <section className="relative rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div
          className="
            overflow-x-auto
            px-2 py-2
            [scrollbar-width:none]
            [&::-webkit-scrollbar]:hidden
          "
        >
          <div className="flex min-w-max items-stretch gap-2">
            <ValueCard
              icon="💼"
              label={t('businessValue.netBusinessValue')}
              value={netBusinessValue}
              variant={netBusinessValue < 0 ? 'danger' : 'primary'}
            />

            <ValueCard
              icon="＋"
              label={t('businessValue.positiveValue')}
              value={totalPositiveValue}
              variant="success"
            />

            <ValueCard
              icon="−"
              label={t('businessValue.negativeValue')}
              value={totalNegativeValue}
              variant="warning"
            />

            <button
              ref={presetButtonRef}
              type="button"
              onClick={openPresetDropdown}
              disabled={loading}
              title={t('businessValue.selectPreset')}
              className={`
                flex h-[52px] min-w-[300px]
                items-center gap-2 rounded-xl
                border px-3 text-left
                transition
                ${
                  showPreset
                    ? 'border-indigo-300 bg-indigo-50 ring-2 ring-indigo-100'
                    : 'border-indigo-200 bg-gradient-to-r from-indigo-50 to-white hover:border-indigo-300'
                }
                disabled:cursor-not-allowed
                disabled:opacity-60
              `}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm">
                {activePreset.icon}
              </span>

              <span className="min-w-0 flex-1 truncate text-sm font-black text-slate-700">
                {t(activePreset.labelKey)}
              </span>

              <span
                className={`shrink-0 text-xs text-indigo-400 transition-transform ${
                  showPreset ? 'rotate-180' : ''
                }`}
              >
                ▾
              </span>
            </button>

            <button
              ref={componentButtonRef}
              type="button"
              onClick={openComponentsDropdown}
              disabled={loading}
              title={t('businessValue.chooseComponents')}
              className={`
                flex h-[52px] min-w-[260px]
                items-center gap-2 rounded-xl
                border px-3 text-left
                transition
                ${
                  showComponents
                    ? 'border-violet-300 bg-violet-50 ring-2 ring-violet-100'
                    : 'border-violet-200 bg-gradient-to-r from-violet-50 to-white hover:border-violet-300'
                }
                disabled:cursor-not-allowed
                disabled:opacity-60
              `}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-sm text-violet-700">
                ☑
              </span>

              <span className="min-w-0 flex-1 truncate text-sm font-black text-slate-700">
                {t('businessValue.components')} ({selectedCount})
              </span>

              <span
                className={`shrink-0 text-xs text-violet-400 transition-transform ${
                  showComponents ? 'rotate-180' : ''
                }`}
              >
                ▾
              </span>
            </button>

            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              title={t('common.refresh')}
              className="
                flex h-[52px] w-[52px]
                shrink-0 items-center
                justify-center rounded-xl
                border border-cyan-200
                bg-gradient-to-br
                from-cyan-50 to-blue-50
                text-lg font-black text-cyan-700
                shadow-sm transition
                hover:-translate-y-0.5
                hover:border-cyan-300
                hover:shadow-md
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >
              <span className={loading ? 'animate-spin' : ''}>↻</span>
            </button>

            <button
              type="button"
              onClick={onApply}
              disabled={loading || selectedCount === 0}
              title={t('common.apply')}
              className="
                flex h-[52px] w-[52px]
                shrink-0 items-center
                justify-center rounded-xl
                bg-gradient-to-br
                from-indigo-600 via-blue-600
                to-cyan-600
                text-white shadow-md
                transition
                hover:-translate-y-0.5
                hover:shadow-lg
                disabled:cursor-not-allowed
                disabled:opacity-50
                disabled:hover:translate-y-0
              "
            >
              {loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <span className="text-lg font-black">✓</span>
              )}
            </button>
          </div>
        </div>
      </section>

      {showPreset &&
        createPortal(
          <div
            ref={presetMenuRef}
            style={{
              position: 'fixed',
              top: `${presetPosition.top}px`,
              left: `${presetPosition.left}px`,
              width: `${PRESET_MENU_WIDTH}px`,
            }}
            className="
              z-[9999]
              overflow-hidden rounded-2xl
              border border-slate-200
              bg-white shadow-2xl
            "
          >
            <div className="border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-blue-50 px-3 py-2.5">
              <div className="text-xs font-black text-indigo-700">
                {t('businessValue.selectPreset')}
              </div>
            </div>

            <div className="p-2">
              {PRESET_OPTIONS.map((option) => {
                const selected = option.key === preset;

                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => handlePresetSelect(option.key)}
                    className={`
                      mb-1 flex w-full
                      items-center gap-3
                      rounded-xl border px-3 py-3
                      text-left transition
                      ${
                        selected
                          ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                          : 'border-transparent bg-white text-slate-700 hover:bg-slate-50'
                      }
                    `}
                  >
                    <span
                      className={`
                        flex h-9 w-9 shrink-0
                        items-center justify-center
                        rounded-xl text-base
                        ${selected ? 'bg-indigo-600 text-white' : 'bg-slate-100'}
                      `}
                    >
                      {option.icon}
                    </span>

                    <span className="min-w-0 flex-1 text-sm font-bold">{t(option.labelKey)}</span>

                    <span
                      className={`
                        flex h-5 w-5
                        items-center justify-center
                        rounded-full text-[11px]
                        font-black
                        ${selected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-transparent'}
                      `}
                    >
                      ✓
                    </span>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}

      {showComponents &&
        createPortal(
          <div
            ref={componentMenuRef}
            style={{
              position: 'fixed',
              top: `${componentPosition.top}px`,
              left: `${componentPosition.left}px`,
              width: `${COMPONENT_MENU_WIDTH}px`,
            }}
            className="
              z-[9999]
              overflow-hidden rounded-2xl
              border border-slate-200
              bg-white shadow-2xl
            "
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-indigo-50 px-3 py-2.5">
              <div>
                <div className="text-xs font-black text-slate-700">
                  {t('businessValue.chooseIncludedValues')}
                </div>

                <div className="mt-0.5 text-[10px] font-semibold text-slate-400">
                  {t('businessValue.components')} ({selectedCount})
                </div>
              </div>

              <button
                type="button"
                onClick={toggleAll}
                disabled={loading}
                className="
                  rounded-lg bg-white px-2.5 py-1.5
                  text-xs font-black text-indigo-600
                  shadow-sm transition
                  hover:bg-indigo-100
                  disabled:opacity-50
                "
              >
                {allSelected ? t('businessValue.clearSelection') : t('businessValue.selectAll')}
              </button>
            </div>

            <div className="max-h-[360px] overflow-y-auto p-2">
              {COMPONENT_OPTIONS.map((option) => {
                const checked = selectedComponents.includes(option.key);

                const negative = option.effect === 'negative';

                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => toggleComponent(option.key)}
                    disabled={loading}
                    className={`
                      mb-1 flex w-full
                      items-center gap-3
                      rounded-xl border
                      px-3 py-2.5 text-left
                      transition
                      ${
                        checked
                          ? negative
                            ? 'border-rose-200 bg-rose-50 text-rose-700'
                            : 'border-indigo-200 bg-indigo-50 text-indigo-700'
                          : 'border-transparent bg-white text-slate-600 hover:bg-slate-50'
                      }
                      disabled:opacity-60
                    `}
                  >
                    <span
                      className={`
                        flex h-9 w-9 shrink-0
                        items-center justify-center
                        rounded-xl text-base
                        ${checked ? (negative ? 'bg-rose-100' : 'bg-indigo-100') : 'bg-slate-100'}
                      `}
                    >
                      {option.icon}
                    </span>

                    <span className="min-w-0 flex-1 text-sm font-bold">{t(option.labelKey)}</span>

                    <span
                      className={`
                        flex h-5 w-5 shrink-0
                        items-center justify-center
                        rounded-md border
                        text-[11px] font-black
                        ${
                          checked
                            ? negative
                              ? 'border-rose-500 bg-rose-500 text-white'
                              : 'border-indigo-500 bg-indigo-500 text-white'
                            : 'border-slate-300 bg-white text-transparent'
                        }
                      `}
                    >
                      ✓
                    </span>
                  </button>
                );
              })}
            </div>

            {selectedCount === 0 && (
              <div className="border-t border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                {t('businessValue.selectAtLeastOne')}
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
};

const ValueCard = ({ icon, label, value, variant = 'primary' }) => {
  const styles = {
    primary: {
      wrapper: 'border-indigo-200 bg-gradient-to-br from-indigo-50 via-blue-50 to-white',
      icon: 'bg-gradient-to-br from-indigo-600 to-blue-600 text-white',
      value: 'text-indigo-800',
    },

    success: {
      wrapper: 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-green-50 to-white',
      icon: 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white',
      value: 'text-emerald-800',
    },

    warning: {
      wrapper: 'border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-white',
      icon: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white',
      value: 'text-orange-800',
    },

    danger: {
      wrapper: 'border-rose-200 bg-gradient-to-br from-rose-50 via-red-50 to-white',
      icon: 'bg-gradient-to-br from-rose-500 to-red-600 text-white',
      value: 'text-rose-700',
    },
  };

  const theme = styles[variant] || styles.primary;

  return (
    <div
      className={`
        flex h-[52px] min-w-[190px]
        items-center gap-2.5
        rounded-xl border px-3
        shadow-sm
        ${theme.wrapper}
      `}
    >
      <div
        className={`
          flex h-8 w-8 shrink-0
          items-center justify-center
          rounded-lg text-sm
          shadow-sm
          ${theme.icon}
        `}
      >
        {icon}
      </div>

      <div className="min-w-0">
        <div className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-500">
          {label}
        </div>

        <div className={`mt-0.5 truncate text-base font-black ${theme.value}`}>
          {t('currency.rs')} {formatBusinessValueAmount(value)}
        </div>
      </div>
    </div>
  );
};

export default BusinessValueTopBar;
