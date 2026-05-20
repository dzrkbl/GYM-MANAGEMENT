import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  fullWidth?: boolean;
  isLoading?: boolean;
}

export function Button({ 
  children, 
  variant = 'primary', 
  fullWidth = false, 
  isLoading = false,
  className = '', 
  ...props 
}: ButtonProps) {
  const baseStyle = "flex items-center justify-center font-medium rounded-lg transition-colors min-h-[44px] px-4 cursor-pointer";
  
  const variants = {
    primary: "bg-cshp-red text-white hover:bg-red-600 disabled:bg-red-300",
    secondary: "bg-cshp-black text-white hover:bg-gray-800 disabled:bg-gray-600",
    outline: "border-2 border-cshp-black text-cshp-black hover:bg-gray-50 disabled:border-gray-300 disabled:text-gray-300",
    danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300"
  };

  return (
    <button 
      className={`${baseStyle} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? (
        <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
      ) : null}
      {children}
    </button>
  );
}
