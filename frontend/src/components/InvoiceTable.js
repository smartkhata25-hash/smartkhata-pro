import React, { useRef } from 'react';
import ProductDropdown from './ProductDropdown';
import { t } from '../i18n/i18n';

const InvoiceTable = ({
  items,
  setItems,
  products,
  handleQtyRateChange,
  clearOnFocus,
  onProductChange,
  historyAutoMode,
  hideCost,
  mode = 'sale',
}) => {
  const qtyRefs = useRef([]);
  const rateRefs = useRef([]);
  const itemRefs = useRef([]);

  const blankRow = () => ({
    search: '',
    name: '',
    productId: '',
    description: '',
    cost: 0,
    quantity: '',
    rate: 0,
    amount: 0,
  });

  // ✅ Keyboard Arrow Navigation
  const handleArrowNavigation = (e, rowIndex, field) => {
    // ⬇️ DOWN
    if (e.key === 'ArrowDown') {
      e.preventDefault();

      if (field === 'item') {
        itemRefs.current[rowIndex + 1]?.focus();
      }

      if (field === 'qty') {
        qtyRefs.current[rowIndex + 1]?.focus();
      }

      if (field === 'rate') {
        rateRefs.current[rowIndex + 1]?.focus();
      }
    }

    // ⬆️ UP
    if (e.key === 'ArrowUp') {
      e.preventDefault();

      if (field === 'item') {
        itemRefs.current[rowIndex - 1]?.focus();
      }

      if (field === 'qty') {
        qtyRefs.current[rowIndex - 1]?.focus();
      }

      if (field === 'rate') {
        rateRefs.current[rowIndex - 1]?.focus();
      }
    }

    // ➡️ RIGHT
    if (e.key === 'ArrowRight') {
      e.preventDefault();

      if (field === 'item') {
        qtyRefs.current[rowIndex]?.focus();
      }

      if (field === 'qty') {
        rateRefs.current[rowIndex]?.focus();
      }
    }

    // ⬅️ LEFT
    if (e.key === 'ArrowLeft') {
      e.preventDefault();

      if (field === 'qty') {
        itemRefs.current[rowIndex]?.focus();
      }

      if (field === 'rate') {
        qtyRefs.current[rowIndex]?.focus();
      }
    }
  };

  return (
    <div className="overflow-x-auto mt-2" style={{ WebkitOverflowScrolling: 'touch' }}>
      <div className="max-h-[35vh] md:max-h-[50vh] overflow-y-auto border rounded">
        <table className="w-full border text-xs md:text-sm leading-none">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              <th className="border px-2 py-1 md:p-1">#</th>

              <th className="border px-2 py-1 md:p-1 w-[35%]">{t('item')}</th>

              <th className="border px-2 py-1 md:p-1 hidden md:table-cell">{t('description')}</th>

              {/* 🔥 PURCHASE MODE */}
              {mode === 'purchase' ? (
                <>
                  <th className="border px-2 py-1 md:p-1">{t('qty')}</th>

                  {!hideCost && <th className="border px-2 py-1 md:p-1">Cost</th>}

                  <th className="border px-2 py-1 md:p-1">{t('amount')}</th>

                  <th className="border px-2 py-1 md:p-1">Sale Price</th>
                </>
              ) : (
                <>
                  {!hideCost && <th className="border px-2 py-1 md:p-1">{t('cost')}</th>}

                  <th className="border px-2 py-1 md:p-1">{t('qty')}</th>

                  <th className="border px-2 py-1 md:p-1">{t('rate')}</th>

                  <th className="border px-2 py-1 md:p-1">
                    <div className="flex items-center justify-between">
                      <span>{t('amount')}</span>
                    </div>
                  </th>
                </>
              )}
            </tr>
          </thead>

          <tbody>
            {items.map((item, index) => (
              <tr key={index} className="text-xs md:text-sm h-5">
                <td className="border px-1 py-0 md:p-0 text-center">{index + 1}</td>

                {/* ✅ Item */}
                <td className="border px-1 py-0 md:p-0">
                  <ProductDropdown
                    inputRef={(el) => (itemRefs.current[index] = el)}
                    onKeyDown={(e) => handleArrowNavigation(e, index, 'item')}
                    productList={products}
                    value={item.search}
                    rowIndex={index}
                    onSelect={(product) => {
                      console.log('📦 Product SELECTED:', product._id, product.name);
                      const updated = [...items];
                      const qty = Number(updated[index].quantity) || 1;

                      updated[index] = {
                        ...updated[index],
                        search: product.name,
                        name: product.name,
                        productId: product._id,
                        description: product.description || '',

                        // ✅ SALE MODE
                        ...(mode !== 'purchase' && {
                          cost: product.unitCost || 0,
                          rate: product.salePrice || 0,
                          amount: qty * (product.salePrice || 0),
                        }),

                        // ✅ PURCHASE MODE
                        ...(mode === 'purchase' && {
                          // Sale Price
                          cost: product.salePrice || 0,

                          // Purchase Cost
                          rate: product.unitCost || 0,

                          // Qty × Cost
                          amount: qty * (product.unitCost || 0),
                        }),

                        quantity: qty,
                      };

                      onProductChange && onProductChange(product._id);

                      const hasEmptyRow = updated.some(
                        (row) => !row.productId && !row.search && !row.quantity && !row.rate
                      );

                      if (index === items.length - 1 && !hasEmptyRow) {
                        updated.push(blankRow());
                      }

                      setItems(updated);

                      window.dispatchEvent(new CustomEvent('show-history'));

                      setTimeout(() => qtyRefs.current[index]?.focus(), 50);
                    }}
                  />
                </td>

                {/* Description */}
                <td className="border p-1 hidden md:table-cell">
                  <input
                    value={item.description || ''}
                    onChange={(e) => {
                      const updated = [...items];
                      updated[index].description = e.target.value;
                      setItems(updated);
                    }}
                    className="w-full border-0 px-1 py-0.5 md:p-1"
                  />
                </td>

                {/* 🔥 PURCHASE MODE ROW */}
                {mode === 'purchase' ? (
                  <>
                    {/* Qty */}
                    <td className="border p-0">
                      <input
                        ref={(el) => (qtyRefs.current[index] = el)}
                        onKeyDown={(e) => handleArrowNavigation(e, index, 'qty')}
                        type="number"
                        value={item.quantity || ''}
                        onChange={(e) => {
                          if (!item.productId && !item.search) return;

                          handleQtyRateChange(index, 'quantity', e.target.value);
                        }}
                        onFocus={clearOnFocus}
                        className="w-full border-0 p-0 text-center h-6 no-spinner"
                      />
                    </td>

                    {/* Cost */}
                    <td className="border p-0">
                      <input
                        ref={(el) => (rateRefs.current[index] = el)}
                        onKeyDown={(e) => handleArrowNavigation(e, index, 'rate')}
                        type="number"
                        value={item.rate || ''}
                        onChange={(e) => {
                          if (!item.productId && !item.search) return;

                          handleQtyRateChange(index, 'rate', e.target.value);
                        }}
                        onFocus={clearOnFocus}
                        className="w-full border-0 p-0 text-center h-6 no-spinner"
                      />
                    </td>

                    {/* Amount */}
                    <td className="border px-0 py-0 md:p-0 text-center font-semibold">
                      {item.amount ? item.amount.toFixed(2) : '0.00'}
                    </td>

                    {/* Sale Price */}
                    <td className="border p-0">
                      <input
                        ref={(el) => (rateRefs.current[index] = el)}
                        onKeyDown={(e) => handleArrowNavigation(e, index, 'rate')}
                        type="number"
                        value={item.cost || ''}
                        onChange={(e) => {
                          if (!item.productId && !item.search) return;

                          handleQtyRateChange(index, 'cost', e.target.value);
                        }}
                        onFocus={clearOnFocus}
                        className="w-full border-0 p-0 text-center h-6 no-spinner"
                      />
                    </td>
                  </>
                ) : (
                  <>
                    {/* Cost */}
                    {!hideCost && (
                      <td className="border px-2 py-1 md:p-1 text-center">
                        {item.cost ? item.cost.toFixed(2) : '0.00'}
                      </td>
                    )}

                    {/* Qty */}
                    <td className="border p-0">
                      <input
                        ref={(el) => (qtyRefs.current[index] = el)}
                        onKeyDown={(e) => handleArrowNavigation(e, index, 'qty')}
                        type="number"
                        value={item.quantity || ''}
                        onChange={(e) => {
                          if (!item.productId && !item.search) return;

                          handleQtyRateChange(index, 'quantity', e.target.value);
                        }}
                        onFocus={clearOnFocus}
                        className="w-full border-0 p-0 text-center h-6 no-spinner"
                      />
                    </td>

                    {/* Rate */}
                    <td className="border p-0">
                      <input
                        ref={(el) => (rateRefs.current[index] = el)}
                        onKeyDown={(e) => handleArrowNavigation(e, index, 'rate')}
                        type="number"
                        value={item.rate || ''}
                        onChange={(e) => {
                          if (!item.productId && !item.search) return;

                          handleQtyRateChange(index, 'rate', e.target.value);
                        }}
                        onFocus={clearOnFocus}
                        className="w-full border-0 p-0 text-center no-spinner"
                      />
                    </td>

                    {/* Amount */}
                    <td className="border px-0 py-0 md:p-0 text-center font-semibold">
                      {item.amount ? item.amount.toFixed(2) : '0.00'}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default InvoiceTable;
