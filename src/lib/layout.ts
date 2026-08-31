/**
 * Hauteur exacte d'une page « écran fixe » (celle qui ne fait PAS défiler le
 * <main> : en-tête figé, zone centrale défilante, pied figé — voir Pointage).
 *
 * On part de 100dvh — la hauteur RÉELLEMENT visible du téléphone, barre
 * d'adresse comprise ou repliée — et on retire ce que le gabarit d'AppLayout
 * occupe déjà autour du contenu :
 *
 *   téléphone : 64 px de barre d'onglets + l'encoche (safe-area) + p-4 (2 × 16)
 *   ordinateur : pas de barre d'onglets (md:pb-0) + p-8 (2 × 32)
 *
 * ⚠️ Si les marges de <main> ou du gabarit changent dans AppLayout.tsx, cette
 * constante doit changer avec elles — c'est le seul endroit à corriger.
 */
export const HAUTEUR_ECRAN =
  'h-[calc(100dvh_-_96px_-_env(safe-area-inset-bottom))] md:h-[calc(100dvh_-_4rem)]';
