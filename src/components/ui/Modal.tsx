import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: 'md' | 'lg' | 'xl';
}

export function Modal({ isOpen, onClose, title, children, width = 'md' }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const widthClasses = {
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl'
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className={`bg-white rounded-xl w-full ${widthClasses[width]} max-h-[90vh] flex flex-col shadow-xl`}>
        <div className="flex justify-between items-center p-4 md:p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-cshp-black">{title}</h2>
          <button onClick={onClose} className="p-2 text-cshp-gray hover:bg-gray-100 rounded-lg cursor-pointer transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 md:p-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
