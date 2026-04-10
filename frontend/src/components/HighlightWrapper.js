import React from 'react';

const HighlightWrapper = ({ children, active, onFocus }) => {
  return (
    <div
      onClick={onFocus}
      style={{
        border: active ? '2px solid #3b82f6' : '1px solid #e5e7eb',
        background: active ? '#eff6ff' : 'transparent',
        padding: '2px',
      }}
    >
      {React.cloneElement(children, {
        onFocus: onFocus,
      })}
    </div>
  );
};

export default HighlightWrapper;
