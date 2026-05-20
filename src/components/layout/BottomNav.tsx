import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Home, Users, CheckSquare, CreditCard, LogOut, UserCog, FileText, CalendarDays } from 'lucide-react';

export function BottomNav() {
  const { user, logout } = useAuth();
  
  const navItems = [
    ...(user?.role === 'ADMIN' ? [{ to: '/dashboard', icon: Home, label: 'Accueil' }] : []),
    { to: '/planning', icon: CalendarDays, label: 'Plan' },
    { to: '/membres', icon: Users, label: 'Membres' },
    { to: '/pointer', icon: CheckSquare, label: 'Pointer' },
    ...(user?.role === 'ADMIN' ? [{ to: '/paiements', icon: CreditCard, label: 'Argent' }] : []),
    ...(user?.role === 'ADMIN' ? [{ to: '/rapports', icon: FileText, label: 'Stats' }] : []),
  ];

  return (
    <nav className="md:hidden fixed bottom-0 w-full bg-white border-t border-gray-200 flex justify-around items-center h-[68px] z-50 px-2 pb-2">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center w-full h-full space-y-1 ${
              isActive ? 'text-cshp-red' : 'text-cshp-gray'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <item.icon size={22} className={isActive ? 'stroke-cshp-red' : ''} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
      <button 
        onClick={logout}
        className="flex flex-col items-center justify-center w-full h-full space-y-1 text-cshp-gray cursor-pointer"
      >
        <LogOut size={22} />
        <span className="text-[10px] font-medium">Quitter</span>
      </button>
    </nav>
  );
}
