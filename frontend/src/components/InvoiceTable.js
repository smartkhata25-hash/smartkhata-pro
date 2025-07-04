import React from 'react';

const InvoiceTable = ({
  items,
  setItems,
  productSuggestions,
  selectedProductIndexByRow,
  handleSearchChange,
  handleProductKeyDown,
  handleProductSelect,
  handleQtyRateChange,
  clearOnFocus,
}) => {
  return (
    <div className="overflow-x-auto mt-6">
      <table className="w-full border">
        <thead className="bg-gray-100">
          <tr>
            <th className="border p-2">#</th>
            <th className="border p-2">Item</th>
            <th className="border p-2">Description</th>
            <th className="border p-2">Cost</th>
            <th className="border p-2">Qty</th>
            <th className="border p-2">Rate</th>
            <th className="border p-2">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index} className="relative">
              <td className="border p-2 text-center">{item.itemNo}</td>

              {/* ✅ Item Cell with Suggestions */}
              <td className="border p-2">
                <div className="relative z-20">
                  <input
                    value={item.search}
                    onChange={(e) => handleSearchChange(index, e.target.value)}
                    onKeyDown={(e) => handleProductKeyDown(e, index)}
                    className="w-full border-0 p-1"
                    autoComplete="off"
                  />
                  {productSuggestions.filter((p) => p.row === index).length > 0 && (
                    <ul className="absolute z-50 bg-white shadow border mt-1 w-60 max-h-40 overflow-auto">
                      {productSuggestions
                        .filter((p) => p.row === index)
                        .map((product, i) => {
                          const isSelected = selectedProductIndexByRow[index] === i;
                          return (
                            <li
                              key={i}
                              onClick={() => handleProductSelect(product, index)}
                              className="cursor-pointer p-2"
                              style={{
                                backgroundColor: isSelected ? '#bbf7d0' : 'white',
                                fontWeight: isSelected ? 'bold' : 'normal',
                              }}
                            >
                              {product.name} – Rs. {product.price}
                            </li>
                          );
                        })}
                    </ul>
                  )}
                </div>
              </td>

              {/* ✅ باقی کالم */}
              <td className="border p-2">
                <input
                  value={item.description}
                  disabled
                  className="w-full bg-gray-100 border-0 p-1"
                />
              </td>
              <td className="border p-2 text-right">{item.cost.toFixed(2)}</td>
              <td className="border p-2">
                <input
                  type="number"
                  value={item.quantity}
                  onChange={(e) => handleQtyRateChange(index, 'quantity', e.target.value)}
                  onFocus={clearOnFocus}
                  className="w-full border-0 p-1 text-right"
                />
              </td>
              <td className="border p-2">
                <input
                  type="number"
                  value={item.rate}
                  onChange={(e) => handleQtyRateChange(index, 'rate', e.target.value)}
                  onFocus={clearOnFocus}
                  className="w-full border-0 p-1 text-right"
                />
              </td>
              <td className="border p-2 text-right font-semibold">Rs. {item.amount.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default InvoiceTable;
