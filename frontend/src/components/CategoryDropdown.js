import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { createCategory } from '../services/categoryService';

const CategoryDropdown = ({ categories = [], value = '', onSelect, onAddCategory, onFocus }) => {
  const [query, setQuery] = useState(value);
  const [filtered, setFiltered] = useState([]);
  const [showList, setShowList] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState({});

  const inputRef = useRef();
  const wrapperRef = useRef();

  // 🔁 sync value
  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  // 🔍 filter
  useEffect(() => {
    const matches = categories
      .filter((c) => query.trim() === '' || c.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 50);

    setFiltered(matches);
  }, [query, categories]);

  // 📤 click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowList(false);
      }
    };

    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, []);

  // 📐 position
  useEffect(() => {
    if (showList && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();

      setDropdownStyle({
        position: 'absolute',
        top: `${rect.bottom + window.scrollY}px`,
        left: `${rect.left + window.scrollX}px`,
        width: `${rect.width}px`,
        zIndex: 9999,
        background: '#fff',
        border: '1px solid #ccc',
        borderRadius: '4px',
        maxHeight: '200px',
        overflowY: 'auto',
        boxShadow: '0px 4px 8px rgba(0,0,0,0.1)',
      });
    }
  }, [showList, query]);

  // ⌨️ keyboard
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
        selectCategory(filtered[highlightIndex]);
      }
    }
  };

  const selectCategory = (cat) => {
    setQuery(cat.name);
    onSelect(cat);
    setShowList(false);
    setHighlightIndex(-1);
  };

  // ➕ add new
  const handleAddNew = async () => {
    if (!query.trim()) return;

    try {
      const created = await createCategory(query.trim());
      onAddCategory && onAddCategory(created);
      onSelect(created);
      setQuery(created.name);
      setShowList(false);
    } catch (err) {
      alert('Error adding category');
    }
  };

  return (
    <>
      <div ref={wrapperRef}>
        <input
          ref={inputRef}
          onKeyDown={handleKeyDown}
          onFocus={(e) => {
            onFocus && onFocus(e);
            setShowList(true);
          }}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowList(true);
            setHighlightIndex(-1);
          }}
          placeholder="Search category..."
          style={{
            width: '100%',
            padding: '4px',
            border: 'none',
            outline: 'none',
            textAlign: 'center',
            fontSize: '13px',
            background: 'transparent',
          }}
        />
      </div>

      {showList &&
        createPortal(
          <ul style={dropdownStyle}>
            {filtered.map((c, i) => (
              <li
                key={c._id}
                onPointerDown={(e) => {
                  e.preventDefault();
                  selectCategory(c);
                }}
                style={{
                  padding: '6px',
                  cursor: 'pointer',
                  background: i === highlightIndex ? '#e0f2fe' : 'transparent',
                }}
              >
                {c.name}
              </li>
            ))}

            {/* ➕ add */}
            {filtered.length === 0 && query.trim() !== '' && (
              <li
                onPointerDown={(e) => {
                  e.preventDefault();
                  handleAddNew();
                }}
                style={{
                  padding: '6px',
                  cursor: 'pointer',
                  color: 'green',
                  fontWeight: '600',
                }}
              >
                ➕ Add as new category "{query}"
              </li>
            )}
          </ul>,
          document.body
        )}
    </>
  );
};

export default CategoryDropdown;
