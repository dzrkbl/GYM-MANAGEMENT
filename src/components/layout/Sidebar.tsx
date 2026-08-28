import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { LogOut } from 'lucide-react';
import { groupesNavigation } from '../../lib/navigation';

/**
 * Menu latéral (ordinateur). Les entrées et leurs groupes vivent dans
 * src/lib/navigation.ts, PARTAGÉ avec le menu mobile : les deux listes
 * avaient divergé et la moitié des pages était introuvable au téléphone.
 * Le <nav> défile (sans ça, les dernières entrées étaient coupées sous la
 * ligne de flottaison sur un portable).
 */
export function Sidebar() {
  const { user, logout } = useAuth();
  const groupes = groupesNavigation(user?.role === 'ADMIN');

  return (
    <aside className="hidden md:flex flex-col w-64 bg-cshp-black text-white h-screen sticky top-0">
      <div className="px-6 py-5 shrink-0">
        <h2 className="text-2xl font-bold text-cshp-red">CSHP</h2>
      </div>

      {/* overflow-y-auto : sans lui, toute entrée au-delà de la hauteur de
          l'écran devient inatteignable. C'est ce qui faisait « disparaître »
          la section Audit, dernière de la liste. */}
      <nav className="flex-1 overflow-y-auto px-4 pb-2 space-y-3">
        {groupes.map((groupe, i) => (
          <div key={groupe.titre ?? `groupe-${i}`} className="space-y-0.5">
            {groupe.titre && (
              <p className="px-4 pt-2 pb-1 text-[10px] uppercase font-extrabold text-gray-500 tracking-wider">
                {groupe.titre}
              </p>
            )}
            {groupe.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                    isActive ? 'bg-cshp-red text-white' : 'text-gray-300 hover:bg-gray-800'
                  }`
                }
              >
                <item.icon size={19} className="shrink-0" />
                <span className="font-medium text-sm">{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="p-4 shrink-0 border-t border-gray-800">
        <button
          onClick={logout}
          className="flex items-center gap-3 px-4 py-2.5 w-full rounded-lg text-gray-300 hover:bg-gray-800 transition-colors cursor-pointer"
        >
          <LogOut size={19} />
          <span className="font-medium text-sm">Déconnexion</span>
        </button>
      </div>
    </aside>
  );
}
