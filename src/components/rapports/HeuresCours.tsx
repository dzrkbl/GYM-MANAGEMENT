import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { formatMontant } from '../../lib/format';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { Settings2, Users, CreditCard, AlertTriangle } from 'lucide-react';

/**
 * Onglet « Heures & cours » : la Table de décision (Livrable 2) branchée sur
 * les vraies données. Inscrits, présents, valeur de séance, coûts et verdicts
 * arrivent CALCULÉS de la base — les seules saisies restantes : capacités,
 * drapeau stratégique et les paramètres du modèle.
 */

interface LigneCours {
  id: string;
  section: string;
  label: string;
  jours: string[];
  startTime: string;
  endTime: string;
  duree: number;
  ssem: number;
  heuresHebdo: number;
  coach: string | null;
  coachSource: 'TAUX' | 'PROPRIO' | 'FORFAIT_REPARTI' | 'SANS_TAUX' | 'NON_ASSIGNE';
  capacite: number | null;
  capaciteDeuxCoachs: number | null;
  strategique: boolean;
  inscrits: number;
  presentsMoyens: number | null;
  seancesObservees: number;
  semainesPleines: number;
  ecartPct: number | null;
  decrochage: boolean;
  valeurSeance: number;
  valeurParInscrit: number;
  coutCoachSeance: number;
  coutLocalSeance: number;
  seuilCoach: number | null;
  seuilComplet: number | null;
  margeCompletHebdo: number;
  verdict: string;
}

interface RapportHeures {
  base: 'net' | 'brut';
  parametres: {
    heuresOuvertesSemaine: number | null;
    heuresAutoSemaine: number;
    heuresOuvertesEffectives: number;
    semainesSaison: number;
    coutMarginalHeure: number;
    valeurHeureProprio: number | null;
    semainesAvantDedoublement: number;
  };
  loyerMensuel: number;
  coutLocalHeure: number;
  cours: LigneCours[];
  reconciliationPaie: { ventileMensuel: number; masseSalarialeMois: number; ecart: number };
  totaux: { margeCompletHebdo: number; heuresCoursSemaine: number; heuresLoueesSemaine: number };
  classementBloque: boolean;
  avertissements: string[];
}

const VERDICTS: Record<string, { label: string; classe: string; titre: string }> = {
  RENTABLE:            { label: 'Rentable',        classe: 'bg-green-100 text-green-700',   titre: 'Les inscrits couvrent le coach ET la part de loyer du créneau' },
  A_SURVEILLER:        { label: 'À surveiller',    classe: 'bg-yellow-100 text-yellow-700', titre: 'Paie son coach, mais pas toute sa part de loyer' },
  A_FUSIONNER:         { label: 'À fusionner',     classe: 'bg-red-100 text-red-600',       titre: 'Sous le seuil coach seul : candidat au regroupement — signal, jamais automatique' },
  A_DEDOUBLER:         { label: 'À dédoubler',     classe: 'bg-blue-100 text-blue-700',     titre: 'Plein plusieurs semaines de suite ET chaque moitié resterait au-dessus de son seuil' },
  DEUXIEME_ENTRAINEUR: { label: '2ᵉ entraîneur ?', classe: 'bg-blue-100 text-blue-700',     titre: 'U8 plein à un entraîneur : passer à deux (capacité 15 → 25) avant d’ouvrir un 2ᵉ créneau' },
  CAPACITE_ATTEINTE:   { label: 'Plein',           classe: 'bg-sky-100 text-sky-700',       titre: 'Présents ≥ capacité — à confirmer sur plusieurs semaines avant de dédoubler' },
  STRATEGIQUE:         { label: 'Stratégique',     classe: 'bg-purple-100 text-purple-700', titre: 'Maintenu à perte en connaissance de cause — sorti du verdict automatique, coût affiché quand même' },
  AUCUN_INSCRIT:       { label: 'Aucun inscrit',   classe: 'bg-gray-100 text-gray-500',     titre: 'Aucun membre actif dans ce groupe' },
  SANS_REVENU:         { label: 'Sans contrat',    classe: 'bg-gray-100 text-gray-500',     titre: 'Des inscrits, mais aucun contrat chiffré : la valeur de séance est inconnue' },
  HORAIRE_INVALIDE:    { label: 'Horaire à corriger', classe: 'bg-red-100 text-red-600',    titre: 'Heures de début/fin illisibles : la durée est comptée 0' },
};

const SOURCES_COACH: Record<string, string> = {
  TAUX: 'taux horaire',
  PROPRIO: 'proprio',
  FORFAIT_REPARTI: 'forfait réparti',
  SANS_TAUX: 'sans taux !',
  NON_ASSIGNE: 'à assigner',
};

export function HeuresCours() {
  const [base, setBase] = useState<'net' | 'brut'>('net');
  const [data, setData] = useState<RapportHeures | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [erreur, setErreur] = useState('');
  const [showParams, setShowParams] = useState(false);
  const [paramsEdit, setParamsEdit] = useState<Record<string, string>>({});
  const [editCours, setEditCours] = useState<Record<string, { capacite: string; capaciteDeuxCoachs: string }>>({});

  const charger = useCallback(async () => {
    setIsLoading(true);
    setErreur('');
    try {
      const d = await apiFetch<RapportHeures>(`/rapports/heures?base=${base}`);
      setData(d);
    } catch (e: any) {
      setErreur(e.message || 'Erreur de chargement');
    } finally {
      setIsLoading(false);
    }
  }, [base]);

  useEffect(() => { charger(); }, [charger]);

  async function sauverParams() {
    try {
      const corps: any = {};
      for (const k of ['heuresOuvertesSemaine', 'semainesSaison', 'coutMarginalHeure', 'valeurHeureProprio', 'semainesAvantDedoublement']) {
        if (k in paramsEdit) corps[k] = paramsEdit[k] === '' ? null : paramsEdit[k];
      }
      if (Object.keys(corps).length === 0) { setShowParams(false); return; }
      await apiFetch('/rapports/heures/parametres', { method: 'PUT', body: JSON.stringify(corps) });
      setParamsEdit({});
      setShowParams(false);
      charger();
    } catch (e: any) {
      alert(e.message || 'Erreur de sauvegarde des paramètres');
    }
  }

  async function patchCours(id: string, corps: any) {
    try {
      await apiFetch(`/cours/${id}`, { method: 'PATCH', body: JSON.stringify(corps) });
      charger();
    } catch (e: any) {
      alert(e.message || 'Erreur de mise à jour du cours');
    }
  }

  if (isLoading && !data) return <div className="flex justify-center p-12"><Spinner /></div>;
  if (erreur) return <div className="p-4 bg-red-50 text-red-600 rounded-lg">{erreur}</div>;
  if (!data) return null;

  const p = data.parametres;
  const champParam = (cle: keyof typeof p, valeurActuelle: number | null, placeholder: string) => (
    <input
      type="number"
      step="any"
      value={paramsEdit[cle] ?? (valeurActuelle === null ? '' : String(valeurActuelle))}
      onChange={(e) => setParamsEdit((prev) => ({ ...prev, [cle]: e.target.value }))}
      placeholder={placeholder}
      className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full bg-white focus:outline-none focus:ring-1 focus:ring-cshp-red"
    />
  );

  return (
    <div className="space-y-4">
      {/* D'où viennent les chiffres : le contrat du module, affiché. */}
      <Card className="p-4 text-xs text-cshp-gray leading-relaxed">
        <strong className="text-cshp-black">Rien ne se ressaisit ici.</strong>{' '}
        Inscrits = les membres actifs de chaque groupe · Présents = la moyenne des 4 dernières semaines où le cours a
        réellement eu lieu (un cours sans pointage ce jour-là n'a pas eu lieu) · Valeur d'une séance = les contrats
        réels des inscrits (mêmes montants que Paiements), annualisés puis divisés par les séances de la saison ·
        Coût du local = le loyer du Module financier ÷ {p.heuresOuvertesEffectives} h ouvertes/sem · Les salaires ne
        portent pas de taxes ; le loyer est {base === 'net' ? 'net de crédits TPS/TVQ' : 'taxes incluses'}.
        Deux cours du même groupe (ex. kickboxing jeudi et dimanche) montrent les mêmes inscrits : la cotisation couvre
        toutes les séances de la semaine, sa valeur est répartie PAR séance — rien n'est compté deux fois.
      </Card>

      {/* Base + paramètres */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg overflow-hidden border border-gray-300">
          {([['net', 'Net'], ['brut', 'Brut']] as const).map(([code, label]) => (
            <button
              key={code}
              onClick={() => setBase(code)}
              className={`px-4 py-1.5 text-xs font-bold transition-colors ${
                base === code ? 'bg-slate-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
              title={code === 'net' ? 'Hors taxes : le vrai bénéfice' : 'Taxes incluses : la trésorerie'}
            >
              {label}
            </button>
          ))}
        </div>
        <Button variant="outline" className="h-9 text-xs px-3 min-h-0" onClick={() => setShowParams(!showParams)}>
          <Settings2 size={14} className="mr-1.5" /> Paramètres du modèle
        </Button>
      </div>

      {showParams && (
        <Card className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
            <label className="space-y-1">
              <span className="font-bold text-cshp-gray uppercase tracking-wider">Heures ouvertes/sem</span>
              {champParam('heuresOuvertesSemaine', p.heuresOuvertesSemaine, `auto : ${p.heuresAutoSemaine} h`)}
              <span className="text-cshp-gray block">Vide = suit l'horaire réel (cours + locations). Ouvrir un créneau fait baisser le coût de tous les autres.</span>
            </label>
            <label className="space-y-1">
              <span className="font-bold text-cshp-gray uppercase tracking-wider">Semaines de saison</span>
              {champParam('semainesSaison', p.semainesSaison, '48')}
              <span className="text-cshp-gray block">48 = fermé 2 sem. l'hiver + 2 l'été. Le loyer des semaines fermées reste porté par les semaines ouvertes.</span>
            </label>
            <label className="space-y-1">
              <span className="font-bold text-cshp-gray uppercase tracking-wider">Coût marginal $/h</span>
              {champParam('coutMarginalHeure', p.coutMarginalHeure, '15')}
              <span className="text-cshp-gray block">Tenir ouvert une heure DE PLUS : hydro, usure, ouverture/ménage. Jamais le loyer.</span>
            </label>
            <label className="space-y-1">
              <span className="font-bold text-cshp-gray uppercase tracking-wider">Heure de proprio $/h</span>
              {champParam('valeurHeureProprio', p.valeurHeureProprio, 'auto (Points & partage)')}
              <span className="text-cshp-gray block">Vide = se remplira au premier trimestre clos de Points & partage. Sans elle, aucun classement de sections.</span>
            </label>
            <label className="space-y-1">
              <span className="font-bold text-cshp-gray uppercase tracking-wider">Sem. avant dédoublement</span>
              {champParam('semainesAvantDedoublement', p.semainesAvantDedoublement, '4')}
              <span className="text-cshp-gray block">Semaines PLEINES consécutives exigées avant de proposer un dédoublement — pas un pic isolé.</span>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="h-9 text-xs px-3 min-h-0" onClick={() => { setParamsEdit({}); setShowParams(false); }}>Annuler</Button>
            <Button className="h-9 text-xs px-3 min-h-0" onClick={sauverParams}>Enregistrer (journalisé)</Button>
          </div>
        </Card>
      )}

      {/* Avertissements : ce qui manque, au lieu d'un chiffre faux. */}
      {data.avertissements.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
          {data.avertissements.map((a, i) => (
            <p key={i} className="text-xs text-amber-800 flex items-start gap-1.5">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {a}
            </p>
          ))}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-[10px] font-bold text-cshp-gray uppercase tracking-wider">Heures ouvertes / sem</p>
          <p className="text-xl font-bold text-cshp-black">{p.heuresOuvertesEffectives} h</p>
          <p className="text-[10px] text-cshp-gray">{p.heuresOuvertesSemaine === null ? `auto (cours ${data.totaux.heuresCoursSemaine} h + locations ${data.totaux.heuresLoueesSemaine} h)` : 'saisi à la main'}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-bold text-cshp-gray uppercase tracking-wider">Coût du local ({base})</p>
          <p className="text-xl font-bold text-cshp-black">{formatMontant(data.coutLocalHeure)}/h</p>
          <p className="text-[10px] text-cshp-gray">loyer {formatMontant(data.loyerMensuel)}/mois × 12 ÷ 52 ÷ {p.heuresOuvertesEffectives} h</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-bold text-cshp-gray uppercase tracking-wider">Marge complète / sem</p>
          <p className={`text-xl font-bold ${data.totaux.margeCompletHebdo < 0 ? 'text-cshp-red' : 'text-green-600'}`}>{formatMontant(data.totaux.margeCompletHebdo)}</p>
          <p className="text-[10px] text-cshp-gray">Σ cours : valeur des inscrits − coach − part de loyer</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-bold text-cshp-gray uppercase tracking-wider">Réconciliation paie</p>
          <p className={`text-xl font-bold ${Math.abs(data.reconciliationPaie.ecart) > 0.01 ? 'text-amber-600' : 'text-green-600'}`}>
            {data.reconciliationPaie.ecart > 0 ? '+' : ''}{formatMontant(data.reconciliationPaie.ecart)}
          </p>
          <p className="text-[10px] text-cshp-gray" title="Le P&L global reste la masse salariale du Module financier ; le coût par cours n'est qu'une ventilation du même argent. L'écart est affiché, jamais caché.">
            ventilé {formatMontant(data.reconciliationPaie.ventileMensuel)}/mois vs masse salariale {formatMontant(data.reconciliationPaie.masseSalarialeMois)}
          </p>
        </Card>
      </div>

      {data.classementBloque && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-cshp-gray">
          🔒 <strong className="text-cshp-black">Pas de classement des sections</strong> tant que l'heure de proprio n'a pas de
          valeur : les cours donnés par les proprios paraissent moins chers qu'ils ne le sont. Elle se remplira toute
          seule au premier trimestre clos de Points & partage (bénéfice ÷ points), ou saisis-la dans les paramètres —
          ce sera journalisé.
        </div>
      )}

      {/* LA table */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs border-collapse min-w-[1080px]">
            <thead>
              <tr className="border-b border-gray-200 text-cshp-gray uppercase tracking-wider font-semibold bg-gray-50 text-[10px]">
                <th className="p-3">Cours</th>
                <th className="p-3">Coach</th>
                <th className="p-3 text-right">Durée</th>
                <th className="p-3 text-right" title="Membres ACTIFS du groupe — clic : les voir dans Membres">Inscrits</th>
                <th className="p-3 text-right" title="Moyenne des 4 dernières semaines où le cours a eu lieu">Présents</th>
                <th className="p-3 text-right" title="(inscrits − présents) ÷ inscrits : décrochage à partir de 30 %">Écart</th>
                <th className="p-3 text-right" title="Capacité du local à 1 entraîneur (U8 : / capacité à 2)">Capacité</th>
                <th className="p-3 text-right" title={`Ce que rapportent les contrats réels des inscrits, par séance (${base})`}>Valeur/séance</th>
                <th className="p-3 text-right" title="Salaire du coach pour la séance (les salaires ne portent pas de taxes)">Coach/séance</th>
                <th className="p-3 text-right" title="Part de loyer du créneau : coût du local × durée">Local/séance</th>
                <th className="p-3 text-right" title="Inscrits pour couvrir le coach seul (plancher : le coût marginal du créneau)">Seuil coach</th>
                <th className="p-3 text-right" title="Inscrits pour couvrir coach + part de loyer">Seuil complet</th>
                <th className="p-3 text-right" title="(valeur des inscrits − coach − local) × séances/sem">Marge/sem</th>
                <th className="p-3" title="Un signal, jamais une action automatique">Verdict</th>
                <th className="p-3">Strat.</th>
                <th className="p-3">Liens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.cours.map((c) => {
                const v = VERDICTS[c.verdict] || { label: c.verdict, classe: 'bg-gray-100 text-gray-500', titre: '' };
                const ed = editCours[c.id];
                return (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors align-top">
                    <td className="p-3">
                      <div className="font-bold text-cshp-black">{c.label}</div>
                      <div className="text-cshp-gray">{c.jours.join('/')} {c.startTime}–{c.endTime}</div>
                    </td>
                    <td className="p-3">
                      <div className="text-cshp-black">{c.coach || '—'}</div>
                      <div className={`text-[10px] ${c.coachSource === 'NON_ASSIGNE' || c.coachSource === 'SANS_TAUX' ? 'text-amber-600 font-semibold' : 'text-cshp-gray'}`}>
                        {SOURCES_COACH[c.coachSource]}
                      </div>
                    </td>
                    <td className="p-3 text-right text-cshp-black">{c.duree} h ×{c.ssem}</td>
                    <td className="p-3 text-right">
                      <Link to={`/membres?groupe=${encodeURIComponent(c.section)}`} className="font-bold text-cshp-black underline decoration-dotted hover:text-cshp-red" title="Voir ses inscrits dans Membres">
                        {c.inscrits}
                      </Link>
                    </td>
                    <td className="p-3 text-right text-cshp-black">
                      {c.presentsMoyens === null ? <span className="text-cshp-gray">—</span> : c.presentsMoyens}
                      {c.seancesObservees > 0 && <div className="text-[10px] text-cshp-gray">{c.seancesObservees} séances</div>}
                    </td>
                    <td className="p-3 text-right">
                      {c.ecartPct === null ? <span className="text-cshp-gray">—</span> : (
                        <span className={c.decrochage ? 'text-cshp-red font-bold' : 'text-cshp-black'}>
                          {c.ecartPct} %{c.decrochage && <div className="text-[10px]">décrochage → Rétention</div>}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <input
                        type="number"
                        value={ed ? ed.capacite : (c.capacite ?? '')}
                        onChange={(e) => setEditCours((prev) => ({ ...prev, [c.id]: { capacite: e.target.value, capaciteDeuxCoachs: ed ? ed.capaciteDeuxCoachs : String(c.capaciteDeuxCoachs ?? '') } }))}
                        onBlur={(e) => { if (e.target.value !== String(c.capacite ?? '')) patchCours(c.id, { capacite: e.target.value === '' ? null : Number(e.target.value) }); }}
                        className="w-12 border border-gray-200 rounded px-1 py-0.5 text-right bg-white focus:outline-none focus:ring-1 focus:ring-cshp-red"
                        title="Capacité à 1 entraîneur (enregistrée en quittant le champ — journalisé)"
                      />
                      {(c.capaciteDeuxCoachs !== null || c.section.toUpperCase().includes('NINJA')) && (
                        <>
                          <span className="text-cshp-gray mx-0.5">/</span>
                          <input
                            type="number"
                            value={ed ? ed.capaciteDeuxCoachs : (c.capaciteDeuxCoachs ?? '')}
                            onChange={(e) => setEditCours((prev) => ({ ...prev, [c.id]: { capacite: ed ? ed.capacite : String(c.capacite ?? ''), capaciteDeuxCoachs: e.target.value } }))}
                            onBlur={(e) => { if (e.target.value !== String(c.capaciteDeuxCoachs ?? '')) patchCours(c.id, { capaciteDeuxCoachs: e.target.value === '' ? null : Number(e.target.value) }); }}
                            className="w-12 border border-gray-200 rounded px-1 py-0.5 text-right bg-white focus:outline-none focus:ring-1 focus:ring-cshp-red"
                            title="Capacité à 2 entraîneurs (U8 : 25)"
                          />
                        </>
                      )}
                    </td>
                    <td className="p-3 text-right font-bold text-cshp-black" title={`${formatMontant(c.valeurParInscrit)} par inscrit`}>{formatMontant(c.valeurSeance)}</td>
                    <td className="p-3 text-right text-cshp-black">{formatMontant(c.coutCoachSeance)}</td>
                    <td className="p-3 text-right text-cshp-black">{formatMontant(c.coutLocalSeance)}</td>
                    <td className="p-3 text-right text-cshp-black">{c.seuilCoach ?? '—'}</td>
                    <td className="p-3 text-right text-cshp-black">{c.seuilComplet ?? '—'}</td>
                    <td className={`p-3 text-right font-bold ${c.margeCompletHebdo < 0 ? 'text-cshp-red' : 'text-green-600'}`}>{formatMontant(c.margeCompletHebdo)}</td>
                    <td className="p-3">
                      <span className={`inline-block px-2 py-0.5 rounded font-bold text-[10px] ${v.classe}`} title={v.titre}>
                        {v.label}{c.verdict === 'CAPACITE_ATTEINTE' && ` (${c.semainesPleines}/${p.semainesAvantDedoublement} sem)`}
                      </span>
                    </td>
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={c.strategique}
                        onChange={(e) => patchCours(c.id, { strategique: e.target.checked })}
                        title="Cours stratégique : maintenu même à perte, sorti du verdict automatique (journalisé)"
                        className="h-4 w-4 accent-cshp-red"
                      />
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <Link to={`/membres?groupe=${encodeURIComponent(c.section)}`} className="inline-flex items-center gap-1 text-cshp-gray hover:text-cshp-red mr-2" title="Ses inscrits (Membres)">
                        <Users size={14} />
                      </Link>
                      <Link to={`/paiements?section=${encodeURIComponent(c.section)}`} className="inline-flex items-center gap-1 text-cshp-gray hover:text-cshp-red" title="Ses paiements et impayés (Paiements)">
                        <CreditCard size={14} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="p-3 text-[10px] text-cshp-gray border-t border-gray-100">
          Trois coûts, jamais confondus : le <strong>coût complet</strong> (coach + part de loyer, ci-dessus) dit si un
          cours est sain ; le <strong>coût marginal</strong> ({formatMontant(p.coutMarginalHeure)}/h) dit ce que coûte
          une heure d'ouverture de plus — c'est LUI le plancher d'un créneau mort, jamais le complet. Les verdicts sont
          des signaux : aucune fermeture, fusion ou dédoublement ne se fait tout seul.
        </p>
      </Card>
    </div>
  );
}
