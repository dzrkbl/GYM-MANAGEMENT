import React, { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col w-full">
        <label className="mb-1 text-sm font-medium text-cshp-black">
          {label}
        </label>
        <input
          ref={ref}
          className={`min-h-[44px] border rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-cshp-red focus:border-transparent transition-shadow ${
            error ? 'border-red-500' : 'border-gray-300'
          } ${className}`}
          {...props}
        />
        {error && <span className="mt-1 text-xs text-red-500">{error}</span>}
      </div>
    );
  }
);
Input.displayName = 'Input';
