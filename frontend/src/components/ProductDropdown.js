import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { t } from '../i18n/i18n';

const ProductDropdown = ({ productList, value = '', onSelect }) => {
  const [query, setQuery] = useState(value);

  // 🔁 Sync value from parent (Edit / Refund case)
  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  const [filtered, setFiltered] = useState([]);
  const [showList, setShowList] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState({});

  const inputRef = useRef();
  const wrapperRef = useRef();
  const navigate = useNavigate();
  const location = useLocation();

  // 🔍 Filter + Sort
  useEffect(() => {
    const matches = productList
      .filter((p) => query.trim() === '' || p.name.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 100);
    setFiltered(matches);
  }, [query, productList]);

  // 📤 Click outside to close
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowList(false);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);

    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, []);

  // 📐 Dropdown Positioning + Scroll Support
  useEffect(() => {
    if (showList && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      const dropdownHeight = 300;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      const shouldOpenUpward = spaceBelow < dropdownHeight && spaceAbove > dropdownHeight;

      const top = shouldOpenUpward
        ? rect.top + window.scrollY - dropdownHeight
        : rect.bottom + window.scrollY;

      setDropdownStyle({
        position: 'absolute',
        top: `${top}px`,
        left: `${rect.left + window.scrollX}px`,
        width: `${rect.width}px`,
        zIndex: 9999,
        background: 'white',
        border: '1px solid #ccc',
        borderRadius: '4px',
        maxHeight: `${dropdownHeight}px`,
        overflowY: 'auto',
        boxShadow: '0px 4px 8px rgba(0,0,0,0.1)',
      });
    }
  }, [showList, query]);

  // ⌨️ Keyboard Navigation
  const handleKeyDown = (e) => {
    if (!showList || filtered.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev <= 0 ? filtered.length - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlightIndex]) {
        selectProduct(filtered[highlightIndex]);
      }
    } else if (e.key === 'Tab') {
      if (highlightIndex >= 0 && filtered[highlightIndex]) {
        e.preventDefault();
        selectProduct(filtered[highlightIndex]);
      }
    }
  };

  const selectProduct = (product) => {
    setQuery(product.name);
    onSelect(product);
    setShowList(false);
    setHighlightIndex(-1);
  };

  // ➕ Navigate to new product form
  const handleAddNewProduct = () => {
    const name = encodeURIComponent(query);
    const returnTo = encodeURIComponent(location.pathname);

    navigate(`/inventory?new=true&name=${name}&return=${returnTo}`);
  };

  return (
    <>
      <div className="relative w-full" ref={wrapperRef}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowList(true);
            setHighlightIndex(-1);
          }}
          onFocus={() => {
            if (filtered.length > 0) {
              setShowList(true);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={t('product.search')}
          className="w-full border p-1 text-sm"
          autoComplete="off"
          onBlur={() => {
            setTimeout(() => {
              setShowList(false);
            }, 150);
          }}
        />
      </div>

      {showList &&
        createPortal(
          <ul style={dropdownStyle} className="text-sm">
            {filtered.map((p, i) => (
              <li
                key={p._id}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  selectProduct(p);
                }}
                className={`px-3 py-2 cursor-pointer whitespace-nowrap hover:bg-blue-100 ${
                  i === highlightIndex ? 'bg-blue-100 font-medium' : ''
                }`}
              >
                <div className="flex justify-between">
                  <span>{p.name}</span>
                  <span className="text-gray-500 text-xs">
                    {p.categoryId?.name || p.category || t('product.inventory')}
                  </span>
                </div>
              </li>
            ))}

            {/* ➕ Show Add Option */}
            {filtered.length === 0 && query.trim() !== '' && (
              <li
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleAddNewProduct();
                }}
                className="px-3 py-2 cursor-pointer hover:bg-green-100 text-green-600 font-semibold"
              >
                ➕ {t('product.addNew')} "{query}"
              </li>
            )}
          </ul>,
          document.body
        )}
    </>
  );
};

export default ProductDropdown;
