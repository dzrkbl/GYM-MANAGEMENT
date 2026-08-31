import {
  Home, Users, CheckSquare, CreditCard, UserCog, FileText, CalendarDays, Tag,
  Coins, UploadCloud, History, Send, Target, Package, Trophy, LifeBuoy,
  LineChart, ReceiptText, Timer,
} from 'lucide-react';

/**
 * LA source unique de la navigation, consommée par la Sidebar (ordinateur) ET
 * par le menu mobile. Avant, les deux étaient des listes séparées : la barre
 * mobile avait divergé (Prospects, Remboursements, Inventaire, Événements…
 * introuvables au téléphone) et entassait 10 icônes illisibles sur une rangée.
 * Toute nouvelle page s'ajoute ICI et apparaît partout, pour le bon rôle.
 */

export interface EntreeNavigation {
  to: string;
  icon: any;
  label: string;
}

export interface GroupeNavigation {
  titre: string | null; // null = pas d'en-tête (le tableau de bord reste isolé)
  items: EntreeNavigation[];
}

export function groupesNavigation(admin: boolean): GroupeNavigation[] {
  return [
    {
      titre: null,
      items: admin ? [{ to: '/dashboard', icon: Home, label: 'Tableau de bord' }] : [],
    },
    {
      titre: 'Au quotidien',
      items: [
        { to: '/pointer', icon: CheckSquare, label: 'Pointage' },
        { to: '/membres', icon: Users, label: 'Membres' },
        { to: '/planning', icon: CalendarDays, label: 'Calendrier' },
        { to: '/retention', icon: LifeBuoy, label: 'Rétention' },
        ...(admin ? [{ to: '/admin/prospects', icon: Target, label: 'Prospects' }] : []),
      ],
    },
    {
      titre: 'Argent',
      items: admin ? [
        { to: '/paiements', icon: CreditCard, label: 'Paiements' },
        { to: '/admin/finances', icon: Coins, label: 'Finances' },
        { to: '/admin/remboursements', icon: ReceiptText, label: 'Remboursements' },
        { to: '/admin/points', icon: Timer, label: 'Points & partage' },
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
}

/**
 * Les 4 onglets ÉPINGLÉS de la barre mobile (le 5e emplacement est « Menu »,
 * qui ouvre tout le reste). Les gestes du quotidien au dojo d'abord : pointer,
 * chercher un membre, appeler les décrocheurs / encaisser.
 */
export function ongletsMobiles(admin: boolean): EntreeNavigation[] {
  return admin
    ? [
        { to: '/dashboard', icon: Home, label: 'Accueil' },
        { to: '/pointer', icon: CheckSquare, label: 'Pointage' },
        { to: '/membres', icon: Users, label: 'Membres' },
        { to: '/paiements', icon: CreditCard, label: 'Paiements' },
      ]
    : [
        { to: '/pointer', icon: CheckSquare, label: 'Pointage' },
        { to: '/membres', icon: Users, label: 'Membres' },
        { to: '/retention', icon: LifeBuoy, label: 'Rétention' },
        { to: '/planning', icon: CalendarDays, label: 'Calendrier' },
      ];
}
