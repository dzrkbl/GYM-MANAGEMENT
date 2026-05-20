import React, { ReactNode } from 'react';

export function Card({ children, className = '', ...props }: { children: ReactNode; className?: string; [key: string]: any }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden ${className}`} {...props}>
      {children}
    </div>
  );
}
