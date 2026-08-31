import React from 'react';

import { t } from '../../i18n/i18n';

import {
  BUSINESS_VALUE_COMPONENTS,
  formatBusinessValueAmount,
} from '../../services/businessValueService';

const CARD_CONFIG = [
  {
    key: BUSINESS_VALUE_COMPONENTS.INVENTORY,
    titleKey: 'businessValue.inventory',
    icon: '📦',
    gradient: 'from-blue-600 via-blue-500 to-indigo-600',
  },
  {
    key: BUSINESS_VALUE_COMPONENTS.ASSETS,
    titleKey: 'businessValue.assets',
    icon: '🏢',
    gradient: 'from-violet-600 via-purple-500 to-fuchsia-600',
  },
  {
    key: BUSINESS_VALUE_COMPONENTS.CASH,
    titleKey: 'businessValue.cash',
    icon: '💵',
    gradient: 'from-emerald-600 via-green-500 to-teal-600',
  },
  {
    key: BUSINESS_VALUE_COMPONENTS.BANK,
    titleKey: 'businessValue.bank',
    icon: '🏦',
    gradient: 'from-cyan-600 via-sky-500 to-blue-600',
  },
  {
    key: BUSINESS_VALUE_COMPONENTS.RECEIVABLES,
    titleKey: 'businessValue.receivables',
    icon: '📥',
    gradient: 'from-amber-500 via-orange-500 to-yellow-600',
  },
  {
    key: BUSINESS_VALUE_COMPONENTS.LOAN_RECEIVABLES,
    titleKey: 'businessValue.receivableLoans',
    icon: 'LR',
    gradient: 'from-teal-600 via-cyan-500 to-blue-600',
  },
  {
    key: BUSINESS_VALUE_COMPONENTS.PAYABLES,
    titleKey: 'businessValue.payables',
    icon: '📤',
    gradient: 'from-rose-600 via-red-500 to-orange-600',
  },
  {
    key: BUSINESS_VALUE_COMPONENTS.LIABILITIES,
    titleKey: 'businessValue.liabilities',
    icon: '💳',
    gradient: 'from-slate-700 via-gray-700 to-slate-900',
  },
];

const BusinessValueSummary = ({ data, loading = false, selectedComponents = [] }) => {
  const components = data?.components || {};

  const isSelected = (key) => {
    if (selectedComponents.length > 0) {
      return selectedComponents.includes(key);
    }

    return components?.[key]?.included === true;
  };

  const visibleCards = CARD_CONFIG.filter((card) => isSelected(card.key));

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {new Array(7).fill(null).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl bg-gray-200" />
        ))}
      </div>
    );
  }

  return (
    <section className="space-y-3">
      {visibleCards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
          <div className="text-4xl">📊</div>

          <h3 className="mt-3 text-base font-bold text-gray-800">
            {t('businessValue.noComponentsSelected')}
          </h3>

          <p className="mt-1 text-sm text-gray-500">{t('businessValue.selectComponentsHelp')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
          {visibleCards.map((card) => {
            const component = components?.[card.key] || {};
            const value = Number(component.value || 0);
            const isNegative =
              component.effect === 'negative' ||
              card.key === BUSINESS_VALUE_COMPONENTS.PAYABLES ||
              card.key === BUSINESS_VALUE_COMPONENTS.LIABILITIES;

            return (
              <SummaryCard
                key={card.key}
                title={t(card.titleKey)}
                icon={card.icon}
                gradient={card.gradient}
                value={value}
                isNegative={isNegative}
                details={component.details || {}}
                componentKey={card.key}
              />
            );
          })}
        </div>
      )}

      {data?.generatedAt && (
        <div className="text-[11px] md:text-xs text-gray-400 text-right px-1">
          {t('businessValue.lastUpdated')}: {new Date(data.generatedAt).toLocaleString()}
        </div>
      )}
    </section>
  );
};

const SummaryCard = ({ title, icon, gradient, value, isNegative, details, componentKey }) => {
  const detailText = getDetailText(componentKey, details);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} text-white shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 min-h-[130px]`}
    >
      <div className="absolute -right-7 -top-7 w-24 h-24 rounded-full bg-white/10"></div>
      <div className="absolute -left-8 -bottom-10 w-28 h-28 rounded-full bg-black/10"></div>

      <div className="relative p-3.5 md:p-4 h-full flex flex-col justify-between">
        <div className="flex items-start justify-between gap-2">
          <div
            className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-lg md:text-xl shadow-sm"
            aria-hidden="true"
          >
            {icon}
          </div>

          <span className="text-[10px] md:text-xs px-2 py-1 rounded-full bg-black/15 font-semibold">
            {isNegative ? t('businessValue.deduction') : t('businessValue.addition')}
          </span>
        </div>

        <div className="mt-4">
          <div className="text-[11px] md:text-xs text-white/80 font-medium truncate">{title}</div>

          <div className="mt-1 text-base sm:text-lg md:text-xl font-extrabold truncate">
            {isNegative ? '− ' : ''}
            {t('currency.rs')} {formatBusinessValueAmount(value)}
          </div>

          {detailText && (
            <div className="mt-1 text-[10px] md:text-[11px] text-white/65 truncate">
              {detailText}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const getDetailText = (componentKey, details = {}) => {
  if (componentKey === BUSINESS_VALUE_COMPONENTS.INVENTORY) {
    return `${Number(details.totalProducts || 0).toLocaleString()} ${t(
      'businessValue.products'
    )} • ${Number(details.totalQty || 0).toLocaleString()} ${t('businessValue.units')}`;
  }

  if (componentKey === BUSINESS_VALUE_COMPONENTS.ASSETS) {
    return `${Number(details.totalAssets || 0).toLocaleString()} ${t('businessValue.assetItems')}`;
  }

  if (componentKey === BUSINESS_VALUE_COMPONENTS.RECEIVABLES) {
    return `${Number(details.totalAccounts || 0).toLocaleString()} ${t(
      'businessValue.accountsCount'
    )}`;
  }

  if (componentKey === BUSINESS_VALUE_COMPONENTS.LOAN_RECEIVABLES) {
    return `${Number(details.totalLoans || 0).toLocaleString()} ${t(
      'businessValue.receivableLoans'
    )}`;
  }

  if (componentKey === BUSINESS_VALUE_COMPONENTS.PAYABLES) {
    return `${Number(details.totalAccounts || 0).toLocaleString()} ${t(
      'businessValue.accountsCount'
    )}`;
  }

  if (componentKey === BUSINESS_VALUE_COMPONENTS.LIABILITIES) {
    return `${Number(details.totalLiabilities || 0).toLocaleString()} ${t(
      'businessValue.liabilityItems'
    )}`;
  }

  return '';
};

export default BusinessValueSummary;
