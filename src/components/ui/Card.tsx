import React, { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden ${className}`}>
      {children}
    </div>
  );
}
