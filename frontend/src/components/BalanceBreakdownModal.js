import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n/i18n';

const BalanceBreakdownModal = ({
  isOpen = false,
  onClose,
  type = 'receivable',
  items = [],
  total = 0,
  onOpenLedger,
}) => {
  const [searchText, setSearchText] = useState('');
  const [entityFilter, setEntityFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('highest');
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const searchInputRef = useRef(null);
  const modalRef = useRef(null);
  const rowRefs = useRef([]);

  const isReceivable = type === 'receivable';

  const modalTitle = isReceivable ? 'Receivables Breakdown' : 'Payables Breakdown';

  const modalSubtitle = isReceivable ? 'Amounts you need to receive' : 'Amounts you need to pay';

  const safeNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  };

  const formatMoney = (value) =>
    safeNumber(value).toLocaleString('en-GB', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

  const normalizedItems = useMemo(() => {
    if (!Array.isArray(items)) {
      return [];
    }

    return items
      .map((item, index) => ({
        entityId: item?.entityId || item?._id || '',
        accountId: item?.accountId || '',
        name: String(item?.name || 'Unnamed').trim(),
        entityType: String(item?.entityType || 'unknown')
          .trim()
          .toLowerCase(),
        amount: safeNumber(item?.amount),
        originalIndex: index,
      }))
      .filter((item) => item.amount > 0);
  }, [items]);

  const filteredItems = useMemo(() => {
    let result = [...normalizedItems];

    const normalizedSearch = searchText.trim().toLowerCase();

    if (normalizedSearch) {
      result = result.filter((item) => {
        const searchableText = [item.name, item.entityType, item.amount]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return searchableText.includes(normalizedSearch);
      });
    }

    if (entityFilter !== 'all') {
      result = result.filter((item) => item.entityType === entityFilter);
    }

    result.sort((a, b) => {
      if (sortOrder === 'lowest') {
        return a.amount - b.amount;
      }

      if (sortOrder === 'name') {
        return a.name.localeCompare(b.name);
      }

      return b.amount - a.amount;
    });

    return result;
  }, [normalizedItems, searchText, entityFilter, sortOrder]);

  const filteredTotal = useMemo(
    () => filteredItems.reduce((sum, item) => sum + safeNumber(item.amount), 0),
    [filteredItems]
  );

  const entityCounts = useMemo(() => {
    return normalizedItems.reduce(
      (counts, item) => {
        if (item.entityType === 'customer') {
          counts.customer += 1;
        }

        if (item.entityType === 'supplier') {
          counts.supplier += 1;
        }

        if (item.entityType === 'party') {
          counts.party += 1;
        }

        return counts;
      },
      {
        customer: 0,
        supplier: 0,
        party: 0,
      }
    );
  }, [normalizedItems]);

  const clearFilters = () => {
    setSearchText('');
    setEntityFilter('all');
    setSortOrder('highest');
    setSelectedIndex(-1);

    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);
  };

  const handleOpenLedger = useCallback(
    (item) => {
      if (!item?.entityId || typeof onOpenLedger !== 'function') {
        return;
      }

      onOpenLedger(item);
    },
    [onOpenLedger]
  );
  const getTypeLabel = (entityType) => {
    if (entityType === 'customer') {
      return 'Customer';
    }

    if (entityType === 'supplier') {
      return 'Supplier';
    }

    if (entityType === 'party') {
      return 'Party';
    }

    return 'Other';
  };

  const getTypeBadgeClass = (entityType) => {
    if (entityType === 'customer') {
      return 'border-blue-200 bg-blue-50 text-blue-700';
    }

    if (entityType === 'supplier') {
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    }

    if (entityType === 'party') {
      return 'border-violet-200 bg-violet-50 text-violet-700';
    }

    return 'border-gray-200 bg-gray-50 text-gray-700';
  };

  const getEntityInitial = (name) => {
    const safeName = String(name || '').trim();

    if (!safeName) {
      return '?';
    }

    return safeName.charAt(0).toUpperCase();
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSearchText('');
    setEntityFilter('all');
    setSortOrder('highest');
    setSelectedIndex(-1);

    const focusTimer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);

    return () => clearTimeout(focusTimer);
  }, [isOpen, type]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
        return;
      }

      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        return;
      }

      if (!filteredItems.length) {
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();

        setSelectedIndex((previousIndex) => {
          const nextIndex = previousIndex < filteredItems.length - 1 ? previousIndex + 1 : 0;

          setTimeout(() => {
            rowRefs.current[nextIndex]?.scrollIntoView({
              block: 'nearest',
              behavior: 'smooth',
            });
          }, 0);

          return nextIndex;
        });
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();

        setSelectedIndex((previousIndex) => {
          const nextIndex = previousIndex > 0 ? previousIndex - 1 : filteredItems.length - 1;

          setTimeout(() => {
            rowRefs.current[nextIndex]?.scrollIntoView({
              block: 'nearest',
              behavior: 'smooth',
            });
          }, 0);

          return nextIndex;
        });
      }

      if (event.key === 'Enter' && selectedIndex >= 0) {
        event.preventDefault();

        const selectedItem = filteredItems[selectedIndex];

        if (selectedItem) {
          handleOpenLedger(selectedItem);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, filteredItems, selectedIndex, onClose, handleOpenLedger]);

  useEffect(() => {
    setSelectedIndex(-1);
    rowRefs.current = [];
  }, [searchText, entityFilter, sortOrder]);

  if (!isOpen) {
    return null;
  }

  const modalContent = (
    <div
      className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/50 p-2 backdrop-blur-sm sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="balance-breakdown-title"
        className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* ================= HEADER ================= */}
        <div
          className={`relative overflow-hidden px-4 py-4 text-white sm:px-6 ${
            isReceivable
              ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500'
              : 'bg-gradient-to-r from-rose-500 via-red-500 to-pink-500'
          }`}
        >
          <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10" />
          <div className="absolute -bottom-12 right-24 h-28 w-28 rounded-full bg-white/10" />

          <div className="relative flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 text-2xl shadow-sm backdrop-blur">
                  {isReceivable ? '📥' : '📤'}
                </div>

                <div>
                  <h2 id="balance-breakdown-title" className="text-xl font-bold sm:text-2xl">
                    {modalTitle}
                  </h2>

                  <p className="mt-1 text-xs text-white/90 sm:text-sm">{modalSubtitle}</p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              title="Close"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/15 text-xl font-bold text-white transition hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white/70"
            >
              ×
            </button>
          </div>

          <div className="relative mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/20 bg-white/15 px-4 py-3 backdrop-blur">
              <div className="text-xs font-medium uppercase tracking-wide text-white/80">
                Total Amount
              </div>

              <div className="mt-1 text-2xl font-bold">Rs. {formatMoney(total)}</div>
            </div>

            <div className="rounded-xl border border-white/20 bg-white/15 px-4 py-3 backdrop-blur">
              <div className="text-xs font-medium uppercase tracking-wide text-white/80">
                Total Entries
              </div>

              <div className="mt-1 text-2xl font-bold">{normalizedItems.length}</div>
            </div>

            <div className="rounded-xl border border-white/20 bg-white/15 px-4 py-3 backdrop-blur">
              <div className="text-xs font-medium uppercase tracking-wide text-white/80">
                Filtered Amount
              </div>

              <div className="mt-1 text-2xl font-bold">Rs. {formatMoney(filteredTotal)}</div>
            </div>
          </div>
        </div>

        {/* ================= FILTERS ================= */}
        <div className="border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                🔍
              </span>

              <input
                ref={searchInputRef}
                type="text"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search by name or type..."
                className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-3 text-sm text-gray-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <select
              value={entityFilter}
              onChange={(event) => setEntityFilter(event.target.value)}
              className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">All Types ({normalizedItems.length})</option>

              <option value="customer">Customers ({entityCounts.customer})</option>

              <option value="supplier">Suppliers ({entityCounts.supplier})</option>

              <option value="party">Parties ({entityCounts.party})</option>
            </select>

            <select
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
              className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="highest">Amount: High to Low</option>
              <option value="lowest">Amount: Low to High</option>
              <option value="name">Name: A to Z</option>
            </select>

            <button
              type="button"
              onClick={clearFilters}
              className="h-10 rounded-lg border border-gray-300 bg-gray-100 px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-200"
            >
              Clear
            </button>
          </div>

          <div className="mt-2 text-xs text-gray-500">
            Showing <span className="font-bold text-gray-800">{filteredItems.length}</span> of{' '}
            <span className="font-bold text-gray-800">{normalizedItems.length}</span> entries
          </div>
        </div>

        {/* ================= DESKTOP TABLE ================= */}
        <div className="hidden min-h-0 flex-1 overflow-auto md:block">
          {filteredItems.length === 0 ? (
            <EmptyState isReceivable={isReceivable} searchText={searchText} />
          ) : (
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead className="sticky top-0 z-20 bg-gray-100">
                <tr>
                  <th className={headerClass}>#</th>
                  <th className={headerClass}>Name</th>
                  <th className={headerClass}>Type</th>
                  <th className={`${headerClass} text-right`}>Amount</th>
                  <th className={`${headerClass} text-center`}>Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredItems.map((item, index) => {
                  const isSelected = selectedIndex === index;

                  return (
                    <tr
                      ref={(element) => {
                        rowRefs.current[index] = element;
                      }}
                      key={`${item.entityType}-${item.entityId}-${index}`}
                      onClick={() => handleOpenLedger(item)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`cursor-pointer border-b border-gray-100 transition ${
                        isSelected
                          ? 'bg-blue-50'
                          : index % 2 === 0
                            ? 'bg-white hover:bg-blue-50'
                            : 'bg-gray-50 hover:bg-blue-50'
                      }`}
                    >
                      <td className={cellClass}>
                        <span className="text-xs font-semibold text-gray-500">{index + 1}</span>
                      </td>

                      <td className={cellClass}>
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                              item.entityType === 'customer'
                                ? 'bg-blue-100 text-blue-700'
                                : item.entityType === 'supplier'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : item.entityType === 'party'
                                    ? 'bg-violet-100 text-violet-700'
                                    : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {getEntityInitial(item.name)}
                          </div>

                          <div className="min-w-0">
                            <div className="truncate font-semibold text-gray-900">{item.name}</div>

                            <div className="mt-0.5 text-xs text-gray-500">Click to view ledger</div>
                          </div>
                        </div>
                      </td>

                      <td className={cellClass}>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getTypeBadgeClass(
                            item.entityType
                          )}`}
                        >
                          {getTypeLabel(item.entityType)}
                        </span>
                      </td>

                      <td className={`${cellClass} text-right whitespace-nowrap`}>
                        <span
                          className={`text-base font-bold ${
                            isReceivable ? 'text-amber-700' : 'text-rose-700'
                          }`}
                        >
                          Rs. {formatMoney(item.amount)}
                        </span>
                      </td>

                      <td className={`${cellClass} text-center whitespace-nowrap`}>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleOpenLedger(item);
                          }}
                          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                        >
                          View Ledger
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ================= MOBILE CARDS ================= */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 p-3 md:hidden">
          {filteredItems.length === 0 ? (
            <EmptyState isReceivable={isReceivable} searchText={searchText} />
          ) : (
            <div className="space-y-3">
              {filteredItems.map((item, index) => (
                <button
                  key={`${item.entityType}-${item.entityId}-${index}`}
                  type="button"
                  onClick={() => handleOpenLedger(item)}
                  className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold ${
                          item.entityType === 'customer'
                            ? 'bg-blue-100 text-blue-700'
                            : item.entityType === 'supplier'
                              ? 'bg-emerald-100 text-emerald-700'
                              : item.entityType === 'party'
                                ? 'bg-violet-100 text-violet-700'
                                : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {getEntityInitial(item.name)}
                      </div>

                      <div className="min-w-0">
                        <div className="truncate font-bold text-gray-900">{item.name}</div>

                        <span
                          className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getTypeBadgeClass(
                            item.entityType
                          )}`}
                        >
                          {getTypeLabel(item.entityType)}
                        </span>
                      </div>
                    </div>

                    <div
                      className={`shrink-0 text-right text-base font-bold ${
                        isReceivable ? 'text-amber-700' : 'text-rose-700'
                      }`}
                    >
                      Rs. {formatMoney(item.amount)}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                    <span className="text-xs text-gray-500">Entry #{index + 1}</span>

                    <span className="text-xs font-semibold text-blue-700">View Ledger →</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ================= FOOTER ================= */}
        <div className="border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs text-gray-500">Filtered total</div>

              <div
                className={`text-lg font-bold ${isReceivable ? 'text-amber-700' : 'text-rose-700'}`}
              >
                Rs. {formatMoney(filteredTotal)}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <span className="hidden text-xs text-gray-400 sm:inline">
                Use ↑ ↓ and Enter to open ledger
              </span>

              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-gray-800 px-5 py-2 text-sm font-semibold text-white transition hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                {t('close') || 'Close'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

const EmptyState = ({ isReceivable, searchText }) => {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-3xl">
        {searchText ? '🔍' : isReceivable ? '📥' : '📤'}
      </div>

      <h3 className="mt-4 text-base font-bold text-gray-800">
        {searchText
          ? 'No matching records found'
          : isReceivable
            ? 'No receivables found'
            : 'No payables found'}
      </h3>

      <p className="mt-2 max-w-sm text-sm text-gray-500">
        {searchText
          ? 'Try changing your search text or filters.'
          : 'There are currently no outstanding balances in this section.'}
      </p>
    </div>
  );
};

const headerClass =
  'border-b border-gray-200 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-600 whitespace-nowrap';

const cellClass = 'border-b border-gray-100 px-4 py-3 text-gray-700';

export default BalanceBreakdownModal;
