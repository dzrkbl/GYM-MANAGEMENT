import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Home, Users, CheckSquare, CreditCard, LogOut, UserCog, FileText, CalendarDays, Tag, Coins, UploadCloud, History, Send, Target, Package, Trophy, LifeBuoy, LineChart } from 'lucide-react';

/**
 * Menu latéral. La liste a grossi jusqu'à 17 entrées, et deux choses en
 * découlaient :
 *  - le <nav> n'avait aucun défilement, donc les DERNIÈRES entrées (Import,
 *    Courriels, Audit) étaient purement et simplement coupées sous la ligne
 *    de flottaison sur un écran d'ordinateur portable, sans aucun moyen de
 *    les atteindre ;
 *  - une liste plate de 17 éléments ne se parcourt plus.
 * D'où le défilement, l'interligne resserré et les regroupements.
 */
export function Sidebar() {
  const { user, logout } = useAuth();
  const admin = user?.role === 'ADMIN';

  // Groupes : un titre nul = pas d'en-tête (le tableau de bord reste isolé).
  const groupes: { titre: string | null; items: { to: string; icon: any; label: string }[] }[] = [
    {
      titre: null,
      items: admin ? [{ to: '/dashboard', icon: Home, label: 'Tableau de bord' }] : [],
    },
    {
      titre: 'Au quotidien',
      items: [
        { to: '/planning', icon: CalendarDays, label: 'Calendrier' },
        { to: '/membres', icon: Users, label: 'Membres' },
        { to: '/pointer', icon: CheckSquare, label: 'Pointage' },
        { to: '/retention', icon: LifeBuoy, label: 'Rétention' },
        ...(admin ? [{ to: '/admin/prospects', icon: Target, label: 'Prospects' }] : []),
      ],
    },
    {
      titre: 'Argent',
      items: admin ? [
        { to: '/paiements', icon: CreditCard, label: 'Paiements' },
        { to: '/admin/finances', icon: Coins, label: 'Finances' },
      ] : [],
    },
    {
      // Inventaire et Événements : accessibles à tout le personnel — le serveur
      // limite chacun à SA discipline (un coach judo voit tout le judo).
      titre: 'Club',
      items: [
        { to: '/admin/inventaire', icon: Package, label: 'Inventaire' },
        { to: '/admin/evenements', icon: Trophy, label: 'Événements' },
        ...(admin ? [{ to: '/coachs', icon: UserCog, label: 'Coachs' }] : []),
        ...(admin ? [{ to: '/sections', icon: Tag, label: 'Sections' }] : []),
      ],
    },
    {
      titre: 'Analyse',
      items: admin ? [
        { to: '/admin/pilotage', icon: LineChart, label: 'Pilotage' },
        { to: '/rapports', icon: FileText, label: 'Rapports' },
      ] : [],
    },
    {
      titre: 'Administration',
      items: admin ? [
        { to: '/admin/communications', icon: Send, label: 'Courriels' },
        { to: '/admin/import', icon: UploadCloud, label: 'Import' },
        { to: '/admin/audit', icon: History, label: 'Audit' },
      ] : [],
    },
  ].filter((g) => g.items.length > 0);

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
