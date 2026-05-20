import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'neutral' | 'belt';
  className?: string;
  colorHex?: string;
}

export function Badge({ children, variant = 'neutral', className = '', colorHex }: BadgeProps) {
  const variants = {
    success: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    danger: 'bg-red-100 text-red-800',
    neutral: 'bg-gray-100 text-gray-800',
    belt: 'text-gray-800 text-xs font-semibold'
  };

  const getBeltColorStyle = (beltName: string) => {
    const lBelt = (beltName || '').toLowerCase();
    if (lBelt.includes('blanche-jaune')) return { background: 'linear-gradient(90deg, #FFFFFF 50%, #FFD700 50%)', border: '1px solid #E5E7EB' };
    if (lBelt.includes('jaune-orange')) return { background: 'linear-gradient(90deg, #FFD700 50%, #FFA500 50%)', border: '1px solid #E5E7EB' };
    if (lBelt.includes('orange-verte')) return { background: 'linear-gradient(90deg, #FFA500 50%, #228B22 50%)', border: '1px solid #E5E7EB' };
    if (lBelt.includes('verte-bleue')) return { background: 'linear-gradient(90deg, #228B22 50%, #0000FF 50%)', border: '1px solid #E5E7EB' };
    if (lBelt.includes('bleue-marron') || lBelt.includes('bleue-rouge')) return { background: 'linear-gradient(90deg, #0000FF 50%, #8B4513 50%)', border: '1px solid #E5E7EB' };
    
    if (lBelt.includes('blanche')) return { backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB' };
    if (lBelt.includes('jaune')) return { backgroundColor: '#FFD700' };
    if (lBelt.includes('orange')) return { backgroundColor: '#FFA500', color: '#fff' };
    if (lBelt.includes('verte')) return { backgroundColor: '#228B22', color: '#fff' };
    if (lBelt.includes('bleue')) return { backgroundColor: '#0000FF', color: '#fff' };
    if (lBelt.includes('marron')) return { backgroundColor: '#8B4513', color: '#fff' };
    if (lBelt.includes('rouge')) return { backgroundColor: '#FF0000', color: '#fff' };
    if (lBelt.includes('noire')) return { backgroundColor: '#000000', color: '#fff' };
    return { backgroundColor: '#F3F4F6' }; // default
  };

  const style: React.CSSProperties = variant === 'belt' ? getBeltColorStyle(typeof children === 'string' ? children : String(children || '')) : {};
  if (colorHex) {
    style.backgroundColor = colorHex;
  }

  return (
    <span 
      className={`px-2 py-1 text-xs font-semibold rounded-full items-center justify-center inline-flex ${variants[variant]} ${className}`}
      style={style}
    >
      {children}
    </span>
  );
}
