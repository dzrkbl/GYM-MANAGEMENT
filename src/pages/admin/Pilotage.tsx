import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LabelList,
} from 'recharts';
import { useAuth } from '../../hooks/useAuth';
import { apiFetch } from '../../lib/api';
import { useSections } from '../../hooks/useSections';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { TrendingUp, TrendingDown, Users, Target, AlertTriangle } from 'lucide-react';

/**
 * Pilotage : d'où viennent les membres, pourquoi ils partent, où se perdent
 * les prospects. Les trois questions du document marketing 11.
 *
 * Couleurs : deux teintes catégorielles seulement, validées pour le daltonisme
 * et le contraste sur fond clair (ΔE CVD 21.6, normal 32.3, contraste ≥ 3:1).
 * Le bleu suit toujours les ARRIVÉES, le rouge les DÉPARTS, dans tous les
 * graphiques : la couleur suit l'entité, jamais le rang.
 */
const ARRIVEES = '#2a78d6';
const DEPARTS = '#e34948';
const AXE = '#898781';      // texte d'axe, volontairement discret
const LIGNE = '#e6e5e0';    // grille récessive

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/** « 2026-08 » → « août 26 ». */
function libelleMois(cle: string): string {
  const [a, m] = cle.split('-').map(Number);
  return `${MOIS_COURTS[m - 1] ?? cle} ${String(a).slice(2)}`;
}

const FENETRES = [
  { mois: 6, label: '6 mois' },
  { mois: 12, label: '12 mois' },
  { mois: 24, label: '2 ans' },
];

function Tuile({ valeur, libelle, aide, ton, icone: Icone }: {
  valeur: string; libelle: string; aide?: string;
  ton?: 'positif' | 'negatif' | 'neutre';
  icone?: any;
}) {
  const couleur = ton === 'positif' ? 'text-emerald-600' : ton === 'negatif' ? 'text-cshp-red' : 'text-cshp-black';
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className={`text-3xl font-bold ${couleur}`}>{valeur}</div>
        {Icone && <Icone size={18} className="text-gray-300 mt-1 shrink-0" />}
      </div>
      <div className="text-xs uppercase font-extrabold text-gray-400 tracking-wider mt-1">{libelle}</div>
      {aide && <p className="text-[11px] text-gray-400 mt-1 leading-snug">{aide}</p>}
    </Card>
  );
}

/** Infobulle commune : le texte reste en encre, jamais en couleur de série. */
function Bulle({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-3 py-2 text-xs">
      {label && <div className="font-bold text-cshp-black mb-1">{label}</div>}
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-1.5 text-gray-700">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.color }} />
          {p.name} : <strong className="text-cshp-black">{p.value}</strong>
        </div>
      ))}
    </div>
  );
}

/** Barres horizontales classées : le libellé porte l'identité, la couleur la magnitude. */
function BarresClassees({ donnees, couleur, vide }: {
  donnees: { nom: string; valeur: number }[]; couleur: string; vide: string;
}) {
  if (donnees.length === 0) return <p className="text-sm text-gray-400 italic py-8 text-center">{vide}</p>;
  // Le motif de départ est saisi en texte libre (jusqu'à 300 caractères) :
  // on écourte pour l'axe, l'infobulle garde le libellé entier.
  const court = (t: string) => (t.length > 24 ? `${t.slice(0, 23)}…` : t);
  const hauteur = Math.max(120, donnees.length * 34 + 16);
  return (
    <ResponsiveContainer width="100%" height={hauteur}>
      <BarChart data={donnees} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 4 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category" dataKey="nom" width={150}
          tick={{ fontSize: 11, fill: AXE }} tickLine={false} axisLine={false}
          tickFormatter={court}
        />
        <Tooltip content={<Bulle />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
        <Bar dataKey="valeur" name="Total" fill={couleur} radius={[0, 4, 4, 0]} barSize={16}>
          {/* Étiquette directe : elle sert aussi de relief pour le daltonisme. */}
          <LabelList dataKey="valeur" position="right" style={{ fontSize: 11, fill: '#52514e', fontWeight: 700 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Pilotage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { getLabel } = useSections();

  const [mois, setMois] = useState(12);
  const [inscriptions, setInscriptions] = useState<any>(null);
  const [churn, setChurn] = useState<any>(null);
  const [entonnoir, setEntonnoir] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.role !== 'ADMIN') return;
    let annule = false;
    setIsLoading(true);
    Promise.all([
      apiFetch<any>(`/dashboard/inscriptions?mois=${mois}`),
      apiFetch<any>(`/dashboard/churn?mois=${mois}`),
      apiFetch<any>(`/dashboard/conversion-funnel?jours=${mois * 30}`),
    ])
      .then(([i, c, e]) => { if (!annule) { setInscriptions(i); setChurn(c); setEntonnoir(e); setError(''); } })
      .catch((err) => { if (!annule) setError(err?.message || 'Chargement impossible'); })
      .finally(() => { if (!annule) setIsLoading(false); });
    return () => { annule = true; };
  }, [mois, user?.role]);

  // Arrivées et départs partagent la clé « AAAA-MM » : ils se superposent
  // sur le même axe, même unité (des membres). Jamais deux échelles.
  const parMois = useMemo(() => {
    if (!inscriptions || !churn) return [];
    const cles = new Set<string>([
      ...inscriptions.periodes.map((p: any) => p.periode),
      ...churn.periodes.map((p: any) => p.periode),
    ]);
    const arr = new Map(inscriptions.periodes.map((p: any) => [p.periode, p.total]));
    const dep = new Map(churn.periodes.map((p: any) => [p.periode, p.total]));
    return [...cles].sort().map((cle) => ({
      cle,
      mois: libelleMois(cle),
      arrivees: (arr.get(cle) as number) || 0,
      departs: (dep.get(cle) as number) || 0,
    }));
  }, [inscriptions, churn]);

  const net = (inscriptions?.total ?? 0) - (churn?.total ?? 0);
  const classees = (obj: Record<string, number> | undefined, formate?: (k: string) => string) =>
    Object.entries(obj || {})
      .map(([nom, valeur]) => ({ nom: formate ? formate(nom) : nom, valeur: valeur as number }))
      .sort((a, b) => b.valeur - a.valeur)
      .slice(0, 8);

  if (user?.role !== 'ADMIN') return <Navigate to="/dashboard" replace />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-cshp-black">Pilotage</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            D'où viennent vos membres, pourquoi ils partent, et où se perdent les prospects.
          </p>
        </div>
        {/* Les filtres vivent sur une seule ligne, au-dessus des graphiques. */}
        <div className="flex gap-2">
          {FENETRES.map((f) => (
            <button
              key={f.mois}
              onClick={() => setMois(f.mois)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                mois === f.mois ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg border border-red-100 text-sm">{error}</div>}

      {isLoading ? (
        <div className="py-16 flex justify-center"><Spinner /></div>
      ) : !inscriptions ? null : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tuile
              valeur={net > 0 ? `+${net}` : String(net)}
              libelle="Croissance nette"
              aide={`${inscriptions.total} arrivée(s) moins ${churn.total} départ(s)`}
              ton={net > 0 ? 'positif' : net < 0 ? 'negatif' : 'neutre'}
              icone={net >= 0 ? TrendingUp : TrendingDown}
            />
            <Tuile
              valeur={`${churn.tauxMensuelPct} %`}
              libelle="Attrition mensuelle"
              aide="Sous 4 %, le parc se maintient"
              ton={churn.tauxMensuelPct > 4 ? 'negatif' : 'positif'}
              icone={Users}
            />
            <Tuile
              valeur={churn.dureeMoyenneMois !== null ? `${churn.dureeMoyenneMois} mois` : '—'}
              libelle="Durée de vie moyenne"
              aide="Ancienneté des membres partis"
            />
            <Tuile
              valeur={`${entonnoir?.taux.globalPct ?? 0} %`}
              libelle="Prospects convertis"
              aide={entonnoir?.delaiMoyenJours !== null ? `Délai moyen : ${entonnoir?.delaiMoyenJours} j` : undefined}
              icone={Target}
            />
          </div>

          {/* Graphique principal : la seule question qui compte vraiment. */}
          <Card className="p-5">
            <h2 className="text-sm font-bold text-cshp-black uppercase tracking-wider">Arrivées et départs, mois par mois</h2>
            <p className="text-xs text-gray-500 mt-1 mb-4">
              Même unité, même axe : la hauteur des deux barres se compare directement.
            </p>
            {parMois.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-10 text-center">Aucun mouvement sur la période.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={parMois} margin={{ top: 8, right: 8, bottom: 4, left: -20 }} barGap={2}>
                  <CartesianGrid stroke={LIGNE} vertical={false} />
                  {/* minTickGap : sur une fenêtre de 24 mois, Recharts saute
                      des étiquettes plutôt que de les superposer. */}
                  <XAxis
                    dataKey="mois" tick={{ fontSize: 11, fill: AXE }} tickLine={false}
                    axisLine={{ stroke: LIGNE }} interval="preserveStartEnd" minTickGap={12}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: AXE }} tickLine={false} axisLine={false} />
                  <Tooltip content={<Bulle />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="square" iconSize={10} />
                  <Bar dataKey="arrivees" name="Arrivées" fill={ARRIVEES} radius={[4, 4, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="departs" name="Départs" fill={DEPARTS} radius={[4, 4, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <h2 className="text-sm font-bold text-cshp-black uppercase tracking-wider">Pourquoi ils partent</h2>
              <p className="text-xs text-gray-500 mt-1 mb-3">
                Le motif se saisit au passage en inactif, sur la fiche du membre.
              </p>
              <BarresClassees
                donnees={classees(churn.parRaison)}
                couleur={DEPARTS}
                vide="Aucun départ enregistré sur la période."
              />
              {churn.total > 0 && churn.avecRaison < churn.total && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-3">
                  {churn.total - churn.avecRaison} départ(s) sans motif renseigné.
                </p>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="text-sm font-bold text-cshp-black uppercase tracking-wider">D'où viennent les inscriptions</h2>
              <p className="text-xs text-gray-500 mt-1 mb-3">
                Provenance déclarée sur la fiche d'inscription en ligne.
              </p>
              <BarresClassees
                donnees={classees(inscriptions.parProvenance)}
                couleur={ARRIVEES}
                vide="Aucune provenance renseignée."
              />
            </Card>
          </div>

          <Card className="p-5">
            <h2 className="text-sm font-bold text-cshp-black uppercase tracking-wider">Entonnoir des prospects</h2>
            <p className="text-xs text-gray-500 mt-1 mb-4">
              Sur {entonnoir?.periode.jours} jours, depuis le {entonnoir?.periode.debut}.
            </p>
            <div className="space-y-3">
              {[
                { nom: 'Prospects reçus', n: entonnoir?.entonnoir.total ?? 0, note: null },
                { nom: 'Traités (sortis de la file)', n: entonnoir?.entonnoir.traites ?? 0, note: `${entonnoir?.taux.traitementPct} % des reçus` },
                { nom: 'Devenus membres', n: entonnoir?.entonnoir.convertis ?? 0, note: `${entonnoir?.taux.conversionPct} % des traités` },
              ].map((etape) => {
                const max = entonnoir?.entonnoir.total || 1;
                return (
                  <div key={etape.nom}>
                    <div className="flex items-baseline justify-between text-xs mb-1">
                      <span className="font-semibold text-gray-700">{etape.nom}</span>
                      <span className="text-gray-500">
                        <strong className="text-cshp-black text-sm">{etape.n}</strong>
                        {etape.note && <span className="ml-2">{etape.note}</span>}
                      </span>
                    </div>
                    <div className="h-4 rounded bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded transition-[width] duration-500"
                        style={{ width: `${Math.round((etape.n / max) * 100)}%`, background: ARRIVEES }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {(entonnoir?.entonnoir.enAttente ?? 0) > 0 && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-4 inline-flex items-center gap-1.5">
                <AlertTriangle size={13} />
                {entonnoir.entonnoir.enAttente} prospect(s) encore sans suivi.
              </p>
            )}
          </Card>

          {/* Vue tableau : le relief exigé par l'accessibilité, et le détail utile. */}
          {churn.departs.length > 0 && (
            <Card className="p-0 overflow-hidden">
              <h2 className="text-sm font-bold text-cshp-black uppercase tracking-wider px-5 pt-5 pb-3">
                Départs de la période
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[560px]">
                  <thead>
                    <tr className="bg-gray-50 border-y border-gray-100 text-gray-500 font-extrabold uppercase text-[10px] tracking-wider">
                      <th className="py-2.5 px-5">Membre</th>
                      <th className="py-2.5 px-4">Groupe</th>
                      <th className="py-2.5 px-4">Départ</th>
                      <th className="py-2.5 px-4">Après</th>
                      <th className="py-2.5 px-4">Motif</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {churn.departs.slice(0, 25).map((d: any) => (
                      <tr key={d.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/membres/${d.id}`)}>
                        <td className="py-2.5 px-5 font-semibold text-cshp-black">{d.nom}</td>
                        <td className="py-2.5 px-4 text-gray-600 text-xs">{getLabel(d.discipline)}</td>
                        <td className="py-2.5 px-4 text-gray-600 text-xs">
                          {d.dateDepart}
                          {d.dateEstimee && <span className="text-amber-600 ml-1" title="Date estimée : aucune trace d'audit">≈</span>}
                        </td>
                        <td className="py-2.5 px-4 text-gray-600 text-xs">{d.moisDeVie !== null ? `${d.moisDeVie} mois` : '—'}</td>
                        <td className="py-2.5 px-4 text-gray-600 text-xs">{d.raison || <span className="text-gray-300">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {churn.datesEstimees > 0 && (
                <p className="text-[11px] text-gray-500 px-5 py-3 border-t border-gray-100">
                  <span className="text-amber-600 font-bold">≈</span> {churn.datesEstimees} date(s) estimée(s) :
                  ces départs sont antérieurs à la journalisation et datent de la dernière modification de la fiche.
                </p>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
