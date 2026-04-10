import React from 'react';

const Toast = ({ message, type }) => {
  if (!message) return null;

  const bg = type === 'error' ? 'bg-red-500' : type === 'success' ? 'bg-green-500' : 'bg-gray-800';

  return (
    <div className={`fixed bottom-5 right-5 text-white px-4 py-2 rounded shadow ${bg}`}>
      {message}
    </div>
  );
};

export default Toast;
