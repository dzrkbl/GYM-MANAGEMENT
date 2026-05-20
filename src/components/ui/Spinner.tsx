import React from 'react';

export function Spinner() {
  return (
    <div className="flex justify-center items-center p-4">
      <div className="w-8 h-8 border-4 border-gray-200 border-t-cshp-red rounded-full animate-spin"></div>
    </div>
  );
}
