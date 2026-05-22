import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Home, Users, CheckSquare, CreditCard, LogOut, UserCog, FileText, CalendarDays, Tag, Coins } from 'lucide-react';

export function Sidebar() {
  const { user, logout } = useAuth();
  
  const navItems = [
    ...(user?.role === 'ADMIN' ? [{ to: '/dashboard', icon: Home, label: 'Tableau de bord' }] : []),
    { to: '/planning', icon: CalendarDays, label: 'Planning' },
    { to: '/membres', icon: Users, label: 'Membres' },
    { to: '/pointer', icon: CheckSquare, label: 'Pointage' },
    ...(user?.role === 'ADMIN' ? [{ to: '/paiements', icon: CreditCard, label: 'Paiements' }] : []),
    ...(user?.role === 'ADMIN' ? [{ to: '/admin/finances', icon: Coins, label: 'Finances' }] : []),
    ...(user?.role === 'ADMIN' ? [{ to: '/rapports', icon: FileText, label: 'Rapports' }] : []),
    ...(user?.role === 'ADMIN' ? [{ to: '/coachs', icon: UserCog, label: 'Coachs' }] : []),
    ...(user?.role === 'ADMIN' ? [{ to: '/sections', icon: Tag, label: 'Sections' }] : []),
  ];

  return (
    <aside className="hidden md:flex flex-col w-64 bg-cshp-black text-white h-screen sticky top-0">
      <div className="p-6">
        <h2 className="text-2xl font-bold text-cshp-red">CSHP</h2>
      </div>
      <nav className="flex-1 px-4 space-y-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive ? 'bg-cshp-red text-white' : 'text-gray-300 hover:bg-gray-800'
              }`
            }
          >
            <item.icon size={20} />
            <span className="font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="p-4">
        <button
          onClick={logout}
          className="flex items-center gap-3 px-4 py-3 w-full rounded-lg text-gray-300 hover:bg-gray-800 transition-colors cursor-pointer"
        >
          <LogOut size={20} />
          <span className="font-medium">Déconnexion</span>
        </button>
      </div>
    </aside>
  );
}
