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
    // Téléphone : la fenêtre s'ancre en BAS (feuille) — un modal centré sur
    // 90vh débordait derrière la barre d'adresse d'iOS et dansait avec le
    // clavier. `dvh` suit la hauteur RÉELLEMENT visible. Ordinateur : centré.
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
      <div className={`bg-white rounded-t-2xl sm:rounded-xl w-full ${widthClasses[width]} max-h-[88dvh] sm:max-h-[90dvh] flex flex-col shadow-xl pb-[env(safe-area-inset-bottom)] sm:pb-0`}>
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
