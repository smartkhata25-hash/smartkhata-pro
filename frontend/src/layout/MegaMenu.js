import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n/i18n';

const MegaMenu = ({ label, sections, path }) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const timeoutRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMouseEnter = () => {
    clearTimeout(timeoutRef.current);
    setOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setOpen(false);
    }, 200); // delay before hiding
  };

  return (
    <div
      ref={menuRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={() => {
          if (path) {
            navigate(path);
          }
        }}
        className="px-3 py-2 text-sm font-medium hover:text-blue-600 transition"
      >
        {t(label)}
      </button>

      {open && !path && sections && (
        <div className="absolute left-0 mt-2 bg-white shadow-xl rounded-xl border border-gray-200 p-4 z-50 min-w-[260px] max-w-[520px] w-max">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {sections?.map((section, idx) => (
              <div key={idx}>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                  {t(section.title)}
                </h4>
                <ul className="space-y-2">
                  {section.items?.map((item, i) => (
                    <li
                      key={i}
                      onClick={() => {
                        navigate(item.path);
                        setOpen(false);
                      }}
                      className="text-sm cursor-pointer hover:text-blue-600 transition"
                    >
                      {t(item.label)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MegaMenu;
