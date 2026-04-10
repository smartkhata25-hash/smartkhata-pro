import React from 'react';

const PageLayout = ({ headerCards, headerContent, children }) => {
  return (
    <div
      className="page-body"
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: '#f9fafb',
        height: '100%',
        minHeight: 0,
      }}
    >
      {/* 🔹 Combined Header Row (Left + Right) */}
      {(headerCards || headerContent) && (
        <div className="flex flex-col md:flex-row justify-between items-start gap-2 md:gap-5 px-3 md:px-4 py-2 md:py-3">
          {/* LEFT SIDE – Filters / Controls */}
          <div className="flex-1 min-w-0 md:min-w-[320px]">{headerContent}</div>

          {/* RIGHT SIDE – Summary Cards */}
          <div className="flex gap-1 md:gap-4">{headerCards}</div>
        </div>
      )}

      {/* 🔹 Page Content */}
      <div
        className="page-content"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default PageLayout;
