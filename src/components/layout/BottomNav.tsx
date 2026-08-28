import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { LogOut, Menu, X } from 'lucide-react';
import { groupesNavigation, ongletsMobiles } from '../../lib/navigation';

/**
 * Navigation mobile. Avant : DIX icônes écrasées sur une rangée (illisibles,
 * cibles de ~37 px) et la moitié des pages (Prospects, Remboursements,
 * Inventaire, Événements…) tout simplement inaccessible au téléphone.
 * Maintenant : 4 onglets épinglés — les gestes du quotidien — plus « Menu »,
 * qui ouvre TOUTES les pages du rôle, groupées comme la barre latérale
 * (source unique : src/lib/navigation.ts). Déconnexion vit dans le menu.
 */
export function BottomNav() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menuOuvert, setMenuOuvert] = useState(false);

  const admin = user?.role === 'ADMIN';
  const onglets = ongletsMobiles(admin);
  const groupes = groupesNavigation(admin);

  // Changer de page ferme le menu ; verrouille le défilement de fond tant
  // qu'il est ouvert (sinon la page défile « derrière » le menu).
  useEffect(() => { setMenuOuvert(false); }, [location.pathname]);
  useEffect(() => {
    if (!menuOuvert) return;
    const precedent = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = precedent; };
  }, [menuOuvert]);

  // « Menu » s'allume quand la page courante n'est PAS un onglet épinglé :
  // l'utilisateur sait toujours « où » il se trouve.
  const surOngletEpingle = onglets.some((o) => location.pathname.startsWith(o.to));

  return (
    <>
      {/* Feuille de menu plein écran */}
      {menuOuvert && (
        <div className="md:hidden fixed inset-0 z-[60] bg-black/40" onClick={() => setMenuOuvert(false)}>
          <div
            className="absolute inset-x-0 bottom-0 max-h-[85dvh] bg-white rounded-t-2xl shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
              <h2 className="text-lg font-bold text-cshp-black">Menu</h2>
              <button
                onClick={() => setMenuOuvert(false)}
                aria-label="Fermer le menu"
                className="p-2.5 -mr-1.5 rounded-full text-cshp-gray hover:bg-gray-100"
              >
                <X size={22} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-4 pb-3 space-y-4">
              {groupes.map((groupe, i) => (
                <div key={groupe.titre ?? `groupe-${i}`}>
                  {groupe.titre && (
                    <p className="px-2 pb-1.5 text-[11px] uppercase font-extrabold text-gray-400 tracking-wider">
                      {groupe.titre}
                    </p>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    {groupe.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                          `flex flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 min-h-[76px] text-center ${
                            isActive
                              ? 'bg-cshp-red border-cshp-red text-white'
                              : 'bg-gray-50 border-gray-200 text-cshp-black active:bg-gray-100'
                          }`
                        }
                      >
                        <item.icon size={22} className="shrink-0" />
                        <span className="text-xs font-semibold leading-tight">{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))}
            </nav>

            <div className="shrink-0 border-t border-gray-100 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <button
                onClick={logout}
                className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl border border-gray-200 text-cshp-gray font-semibold active:bg-gray-100"
              >
                <LogOut size={19} /> Déconnexion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barre d'onglets */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 z-50 flex items-stretch pb-[env(safe-area-inset-bottom)]">
        {onglets.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 gap-1 py-2 min-h-[60px] ${
                isActive ? 'text-cshp-red' : 'text-cshp-gray'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon size={23} className={isActive ? 'stroke-cshp-red' : ''} />
                <span className="text-[11px] font-semibold">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
        <button
          onClick={() => setMenuOuvert(true)}
          aria-label="Ouvrir le menu complet"
          className={`flex flex-col items-center justify-center flex-1 gap-1 py-2 min-h-[60px] ${
            menuOuvert || !surOngletEpingle ? 'text-cshp-red' : 'text-cshp-gray'
          }`}
        >
          <Menu size={23} />
          <span className="text-[11px] font-semibold">Menu</span>
        </button>
      </nav>
    </>
  );
}
