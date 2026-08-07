import React from 'react';
import { t } from '../../i18n/i18n';

const SUMMARY_CARD_CONFIG = Object.freeze([
  {
    key: 'totalNetSales',
    labelKey: 'productPerformance.summary.totalNetSales',
    type: 'currency',
    view: 'best-selling',
    colorTheme: 'blue',
    eyebrow: 'Revenue',
    accent: 'Sales',
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
        />
      </svg>
    ),
  },
  {
    key: 'totalNetProfit',
    labelKey: 'productPerformance.summary.totalNetProfit',
    type: 'currency',
    view: 'most-profitable',
    colorTheme: 'emerald',
    eyebrow: 'Earnings',
    accent: 'Profit',
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  {
    key: 'totalNetSoldQty',
    labelKey: 'productPerformance.summary.totalNetSoldQty',
    type: 'number',
    view: 'best-selling',
    colorTheme: 'cyan',
    eyebrow: 'Volume',
    accent: 'Units',
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
        />
      </svg>
    ),
  },
  {
    key: 'deadStockValue',
    labelKey: 'productPerformance.summary.deadStockValue',
    type: 'currency',
    view: 'dead-stock',
    colorTheme: 'rose',
    eyebrow: 'Attention',
    accent: 'Dead Stock',
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
    ),
  },
  {
    key: 'neverSoldStockValue',
    labelKey: 'productPerformance.summary.neverSoldStockValue',
    type: 'currency',
    view: 'never-sold',
    colorTheme: 'violet',
    eyebrow: 'Inventory',
    accent: 'Never Sold',
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
        />
      </svg>
    ),
  },
]);

const themeStyles = {
  blue: {
    card: 'from-blue-600 via-indigo-600 to-violet-700 border-blue-400/40 shadow-blue-900/20',
    glow: 'bg-blue-300/30',
    glowSecondary: 'bg-indigo-950/20',
    icon: 'bg-white/15 border-white/20 text-white shadow-blue-950/20',
    badge: 'bg-white/15 border-white/20 text-blue-50',
    eyebrow: 'text-blue-100/80',
    footer: 'text-blue-100/90',
    dot: 'bg-blue-200',
  },

  emerald: {
    card: 'from-emerald-600 via-teal-600 to-cyan-700 border-emerald-400/40 shadow-emerald-900/20',
    glow: 'bg-emerald-300/30',
    glowSecondary: 'bg-teal-950/20',
    icon: 'bg-white/15 border-white/20 text-white shadow-emerald-950/20',
    badge: 'bg-white/15 border-white/20 text-emerald-50',
    eyebrow: 'text-emerald-100/80',
    footer: 'text-emerald-100/90',
    dot: 'bg-emerald-200',
  },

  cyan: {
    card: 'from-cyan-600 via-sky-600 to-blue-700 border-cyan-400/40 shadow-cyan-900/20',
    glow: 'bg-cyan-300/30',
    glowSecondary: 'bg-sky-950/20',
    icon: 'bg-white/15 border-white/20 text-white shadow-cyan-950/20',
    badge: 'bg-white/15 border-white/20 text-cyan-50',
    eyebrow: 'text-cyan-100/80',
    footer: 'text-cyan-100/90',
    dot: 'bg-cyan-200',
  },

  rose: {
    card: 'from-rose-600 via-pink-600 to-fuchsia-700 border-rose-400/40 shadow-rose-900/20',
    glow: 'bg-rose-300/30',
    glowSecondary: 'bg-pink-950/20',
    icon: 'bg-white/15 border-white/20 text-white shadow-rose-950/20',
    badge: 'bg-white/15 border-white/20 text-rose-50',
    eyebrow: 'text-rose-100/80',
    footer: 'text-rose-100/90',
    dot: 'bg-rose-200',
  },

  violet: {
    card: 'from-violet-600 via-purple-600 to-indigo-800 border-violet-400/40 shadow-violet-900/20',
    glow: 'bg-violet-300/30',
    glowSecondary: 'bg-purple-950/25',
    icon: 'bg-white/15 border-white/20 text-white shadow-violet-950/20',
    badge: 'bg-white/15 border-white/20 text-violet-50',
    eyebrow: 'text-violet-100/80',
    footer: 'text-violet-100/90',
    dot: 'bg-violet-200',
  },

  amber: {
    card: 'from-amber-500 via-orange-500 to-red-600 border-amber-300/50 shadow-orange-900/20',
    glow: 'bg-yellow-200/40',
    glowSecondary: 'bg-red-950/20',
    icon: 'bg-white/20 border-white/25 text-white shadow-orange-950/20',
    badge: 'bg-white/15 border-white/25 text-amber-50',
    eyebrow: 'text-amber-100/90',
    footer: 'text-amber-50/90',
    dot: 'bg-yellow-200',
  },
};

const getSafeNumber = (value) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

const numberFormatter = new Intl.NumberFormat();

const formatNumber = (value) => numberFormatter.format(getSafeNumber(value));

const formatCurrency = (value) =>
  `${t('currency.rs')} ${numberFormatter.format(Math.round(getSafeNumber(value)))}`;

const getCardValue = (card, summary) => {
  if (!summary) {
    return card.type === 'currency' ? formatCurrency(0) : formatNumber(0);
  }

  if (card.type === 'combinedNumber') {
    const primaryValue = getSafeNumber(summary[card.key]);
    const secondaryValue = getSafeNumber(summary[card.secondaryKey]);

    return formatNumber(primaryValue + secondaryValue);
  }

  if (card.type === 'currency') {
    return formatCurrency(summary[card.key]);
  }

  return formatNumber(summary[card.key]);
};

const ArrowIcon = () => (
  <svg
    className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M9 5l7 7-7 7" />
  </svg>
);

const SparkleIcon = () => (
  <svg
    className="h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z"
    />
  </svg>
);

const SummaryCardSkeleton = () => (
  <div className="relative min-h-[150px] overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="absolute -right-8 -top-8 h-24 w-24 animate-pulse rounded-full bg-slate-100" />

    <div className="relative animate-pulse">
      <div className="flex items-start justify-between">
        <div>
          <div className="h-2.5 w-14 rounded-full bg-slate-200" />
          <div className="mt-2 h-3 w-24 rounded-full bg-slate-200" />
        </div>

        <div className="h-10 w-10 rounded-xl bg-slate-200" />
      </div>

      <div className="mt-7 h-7 w-32 rounded-lg bg-slate-200" />

      <div className="mt-5 flex items-center justify-between">
        <div className="h-2.5 w-16 rounded-full bg-slate-200" />
        <div className="h-5 w-14 rounded-full bg-slate-100" />
      </div>
    </div>
  </div>
);

const cardBaseClass = `
group
relative
isolate
w-full
min-h-[150px]
overflow-hidden
rounded-3xl
border
p-4
text-left
text-white
shadow-lg
transition-all
duration-300
ease-out
focus:outline-none
focus-visible:ring-4
focus-visible:ring-slate-300/60
disabled:cursor-not-allowed
disabled:opacity-60
`;

const SummaryCard = ({
  label,
  value,
  isActive = false,
  disabled = false,
  colorTheme = 'blue',
  icon,
  eyebrow,
  accent,
  onClick,
}) => {
  const theme = themeStyles[colorTheme] || themeStyles.blue;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={isActive}
      className={`
        ${cardBaseClass}
        bg-gradient-to-br
        ${theme.card}
        ${
          isActive
            ? '-translate-y-1 scale-[1.02] ring-2 ring-white/70 shadow-2xl'
            : 'hover:-translate-y-1.5 hover:scale-[1.015] hover:shadow-2xl'
        }
      `}
    >
      <div
        className={`
          pointer-events-none
          absolute
          -right-10
          -top-12
          h-32
          w-32
          rounded-full
          blur-2xl
          transition-transform
          duration-500
          group-hover:scale-125
          ${theme.glow}
        `}
      />

      <div
        className={`
          pointer-events-none
          absolute
          -bottom-14
          -left-10
          h-32
          w-32
          rounded-full
          blur-2xl
          ${theme.glowSecondary}
        `}
      />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-white/10" />

      <div className="pointer-events-none absolute right-3 top-3 h-16 w-16 rounded-full border border-white/10" />
      <div className="pointer-events-none absolute right-7 top-7 h-9 w-9 rounded-full border border-white/10" />

      <div className="relative z-10 flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div
              className={`
                flex
                items-center
                gap-1.5
                text-[9px]
                font-extrabold
                uppercase
                tracking-[0.18em]
                ${theme.eyebrow}
              `}
            >
              <span className={`h-1.5 w-1.5 rounded-full shadow-sm ${theme.dot}`} />
              {eyebrow}
            </div>

            <p className="mt-1.5 line-clamp-2 text-[11px] font-semibold leading-4 text-white/90">
              {label}
            </p>
          </div>

          <div
            className={`
              flex
              h-10
              w-10
              shrink-0
              items-center
              justify-center
              rounded-2xl
              border
              backdrop-blur-md
              shadow-lg
              transition-all
              duration-300
              group-hover:rotate-3
              group-hover:scale-110
              ${theme.icon}
            `}
          >
            {icon}
          </div>
        </div>

        <div className="mt-5">
          <h3
            className="
              truncate
              text-[20px]
              font-black
              leading-none
              tracking-tight
              text-white
              drop-shadow-sm
              xl:text-[22px]
            "
            title={String(value)}
          >
            {value}
          </h3>

          <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/15 pt-3">
            <span
              className={`
                inline-flex
                min-w-0
                items-center
                gap-1
                truncate
                text-[10px]
                font-semibold
                ${theme.footer}
              `}
            >
              <SparkleIcon />
              {accent}
            </span>

            <span
              className={`
                inline-flex
                shrink-0
                items-center
                gap-1
                rounded-full
                border
                px-2
                py-1
                text-[9px]
                font-bold
                uppercase
                tracking-wide
                backdrop-blur-md
                transition-all
                duration-300
                group-hover:bg-white/25
                ${theme.badge}
              `}
            >
              {isActive ? 'Active' : 'View'}
              <ArrowIcon />
            </span>
          </div>
        </div>
      </div>
    </button>
  );
};

const TopProductCard = ({ topProduct, isActive = false, disabled = false, onClick }) => {
  const hasTopProduct = Boolean(topProduct?.productId);
  const theme = themeStyles.amber;

  const performanceScore = getSafeNumber(topProduct?.performanceScore).toFixed(1);

  const netProfit = formatCurrency(topProduct?.netProfit);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !hasTopProduct}
      aria-pressed={isActive}
      className={`
        ${cardBaseClass}
        bg-gradient-to-br
        ${theme.card}
        ${
          isActive
            ? '-translate-y-1 scale-[1.02] ring-2 ring-white/70 shadow-2xl'
            : 'hover:-translate-y-1.5 hover:scale-[1.015] hover:shadow-2xl'
        }
      `}
    >
      <div
        className={`
          pointer-events-none
          absolute
          -right-10
          -top-12
          h-36
          w-36
          rounded-full
          blur-2xl
          transition-transform
          duration-500
          group-hover:scale-125
          ${theme.glow}
        `}
      />

      <div
        className={`
          pointer-events-none
          absolute
          -bottom-16
          -left-12
          h-36
          w-36
          rounded-full
          blur-2xl
          ${theme.glowSecondary}
        `}
      />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-white/15" />

      <div className="pointer-events-none absolute -right-2 top-12 rotate-12 text-[72px] font-black leading-none text-white/[0.06]">
        01
      </div>

      <div className="relative z-10 flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div
              className={`
                flex
                items-center
                gap-1.5
                text-[9px]
                font-extrabold
                uppercase
                tracking-[0.18em]
                ${theme.eyebrow}
              `}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${theme.dot}`} />
              Best Performer
            </div>

            <p className="mt-1.5 text-[11px] font-semibold text-white/90">
              🏆 {t('productPerformance.summary.topProduct')}
            </p>
          </div>

          <div
            className={`
              flex
              h-10
              w-10
              shrink-0
              items-center
              justify-center
              rounded-2xl
              border
              backdrop-blur-md
              shadow-lg
              transition-all
              duration-300
              group-hover:-rotate-6
              group-hover:scale-110
              ${theme.icon}
            `}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0V4z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M7 6H4v2a4 4 0 004 4M17 6h3v2a4 4 0 01-4 4"
              />
            </svg>
          </div>
        </div>

        <div className="mt-4">
          <h3
            className="
              truncate
              text-[17px]
              font-black
              leading-tight
              tracking-tight
              text-white
              drop-shadow-sm
            "
            title={topProduct?.productName || ''}
          >
            {topProduct?.productName || t('productPerformance.summary.noTopProduct')}
          </h3>

          {hasTopProduct ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/15 bg-black/10 px-2.5 py-2 backdrop-blur-md">
                <p className="text-[8px] font-bold uppercase tracking-wider text-white/65">Score</p>

                <div className="mt-0.5 flex items-center gap-1">
                  <span className="text-xs">⭐</span>
                  <span className="text-[12px] font-black text-white">{performanceScore}</span>
                </div>
              </div>

              <div className="rounded-xl border border-white/15 bg-black/10 px-2.5 py-2 backdrop-blur-md">
                <p className="text-[8px] font-bold uppercase tracking-wider text-white/65">
                  Net Profit
                </p>

                <p className="mt-0.5 truncate text-[11px] font-black text-white" title={netProfit}>
                  {netProfit}
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-white/15 bg-black/10 px-3 py-2 text-[10px] font-semibold text-white/75 backdrop-blur-md">
              No performance data available
            </div>
          )}

          <div className="mt-3 flex items-center justify-between border-t border-white/15 pt-2.5">
            <span
              className={`
                inline-flex
                items-center
                gap-1
                text-[10px]
                font-semibold
                ${theme.footer}
              `}
            >
              <SparkleIcon />
              Performance Leader
            </span>

            {hasTopProduct && (
              <span
                className={`
                  inline-flex
                  items-center
                  gap-1
                  rounded-full
                  border
                  px-2
                  py-1
                  text-[9px]
                  font-bold
                  uppercase
                  tracking-wide
                  backdrop-blur-md
                  ${theme.badge}
                `}
              >
                {isActive ? 'Active' : 'View'}
                <ArrowIcon />
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
};

const ProductPerformanceSummaryCards = ({
  summary = null,
  loading = false,
  activeView = 'all',
  onViewChange,
}) => {
  const handleViewChange = (view) => {
    if (loading || !view || typeof onViewChange !== 'function' || view === activeView) {
      return;
    }

    onViewChange(view);
  };

  if (loading && !summary) {
    return (
      <section
        aria-label={t('productPerformance.summary.sectionLabel')}
        className="
          grid
          grid-cols-1
          gap-3.5
          sm:grid-cols-2
          lg:grid-cols-3
          xl:grid-cols-6
        "
      >
        {Array.from({ length: 6 }).map((_, index) => (
          <SummaryCardSkeleton key={index} />
        ))}
      </section>
    );
  }

  return (
    <section
      aria-label={t('productPerformance.summary.sectionLabel')}
      className="
        grid
        grid-cols-1
        gap-3.5
        sm:grid-cols-2
        lg:grid-cols-3
        xl:grid-cols-6
      "
    >
      <TopProductCard
        topProduct={summary?.topProduct || null}
        isActive={activeView === 'top-performing'}
        disabled={loading}
        onClick={() => handleViewChange('top-performing')}
      />

      {SUMMARY_CARD_CONFIG.map((card) => (
        <SummaryCard
          key={card.key}
          label={t(card.labelKey)}
          value={getCardValue(card, summary)}
          isActive={activeView === card.view}
          colorTheme={card.colorTheme}
          icon={card.icon}
          eyebrow={card.eyebrow}
          accent={card.accent}
          disabled={loading}
          onClick={() => handleViewChange(card.view)}
        />
      ))}
    </section>
  );
};

export default ProductPerformanceSummaryCards;
