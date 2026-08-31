import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { apiFetch } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Timer, Plus, Check, Undo2, Pencil, Trash2, RefreshCw, Scale, ListChecks } from 'lucide-react';

/**
 * Page « Points & partage » — le module de l'entente de redevabilité.
 *  - Plan : les tâches datées (qui, quoi, pour quand), les récurrentes et la
 *    génération du mois. « Fait » fige les points ; une reprise (par l'autre,
 *    à partir de J+3) bascule 100 % des points.
 *  - Trimestre : points automatiques (déduits de l'app) + plan, ratios,
 *    bénéfice net, report (extinction 30 juin), parts, acomptes, soldes.
 *  - Barème : le catalogue, modifiable librement — TOUT est journalisé
 *    (Audit → Gestion du temps).
 */

interface Associe { id: string; nom: string }
interface LigneBareme {
  id: string; code: string | null; famille: string; nom: string; mode: string;
  valeur: number; supplement: number; preuve: string; note: string | null; actif: boolean;
}
interface TachePlan {
  id: string; tacheId: string; dateLimite: string; assigneeId: string; assigneeNom: string;
  quantite: number; duree: number | null; statut: string; faitParId: string | null;
  faitParNom: string | null; faitLe: string | null; points: number | null; note: string | null;
  recurrenteId: string | null;
  tache: { nom: string; famille: string; mode: string; valeur: number; supplement: number; preuve: string; code: string | null };
}

const FAMILLES = ['ENSEIGNEMENT', 'COMPETITION', 'MEMBRES', 'ARGENT', 'DEVELOPPEMENT', 'LOCAL', 'RELATIONS_EXT', 'GOUVERNANCE', 'HORS_LISTE'];
const fmt$ = (n: number) => n.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
const fmtPts = (n: number) => (Math.round(n * 100) / 100).toLocaleString('fr-CA');
const jour = (s: string) => s.slice(0, 10);
const aujourdhuiISO = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};

export function GestionTemps() {
  const { user } = useAuth();
  const [onglet, setOnglet] = useState<'PLAN' | 'TRIMESTRE' | 'BAREME'>('PLAN');
  const [associes, setAssocies] = useState<Associe[]>([]);
  const [bareme, setBareme] = useState<LigneBareme[]>([]);
  const [plan, setPlan] = useState<TachePlan[]>([]);
  const [recurrentes, setRecurrentes] = useState<any[]>([]);
  const [trimestre, setTrimestre] = useState<any>(null);
  const [saison, setSaison] = useState<number>(() => { const n = new Date(); return n.getMonth() + 1 >= 9 ? n.getFullYear() : n.getFullYear() - 1; });
  const [numero, setNumero] = useState<number>(() => { const m = new Date().getMonth() + 1; return m >= 9 && m <= 11 ? 1 : (m === 12 || m <= 2) ? 2 : m <= 5 ? 3 : 4; });
  const [isLoading, setIsLoading] = useState(true);
  const [chargeTrim, setChargeTrim] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // Modales
  const [modalTache, setModalTache] = useState<null | { edit?: TachePlan }>(null);
  const [modalFait, setModalFait] = useState<null | TachePlan>(null);
  const [modalBareme, setModalBareme] = useState<null | { edit?: LigneBareme }>(null);
  const [modalRec, setModalRec] = useState<null | { edit?: any }>(null);
  const [voirRecurrentes, setVoirRecurrentes] = useState(false);
  const [formT, setFormT] = useState<any>({});
  const [formF, setFormF] = useState<any>({});
  const [formB, setFormB] = useState<any>({});
  const [formR, setFormR] = useState<any>({});
  const [formAcompte, setFormAcompte] = useState<any>(null);

  const chargerBase = async () => {
    try {
      const [a, b, p, r] = await Promise.all([
        apiFetch<Associe[]>('/gestion-temps/associes'),
        apiFetch<LigneBareme[]>('/gestion-temps/bareme'),
        apiFetch<TachePlan[]>('/gestion-temps/plan'),
        apiFetch<any[]>('/gestion-temps/recurrentes'),
      ]);
      setAssocies(a); setBareme(b); setPlan(p); setRecurrentes(r);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Erreur de chargement');
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => { chargerBase(); }, []);

  useEffect(() => {
    if (onglet !== 'TRIMESTRE') return;
    setChargeTrim(true);
    apiFetch<any>(`/gestion-temps/trimestre?saison=${saison}&numero=${numero}`)
      .then(setTrimestre)
      .catch((e) => setError(e?.message || 'Erreur du trimestre'))
      .finally(() => setChargeTrim(false));
  }, [onglet, saison, numero, plan]);

  const auj = aujourdhuiISO();
  const groupes = useMemo(() => {
    const enRetard = plan.filter((t) => t.statut === 'A_FAIRE' && jour(t.dateLimite) < auj);
    const aVenir = plan.filter((t) => t.statut === 'A_FAIRE' && jour(t.dateLimite) >= auj);
    const reglees = plan.filter((t) => t.statut === 'FAIT' || t.statut === 'REPRIS').slice(-60).reverse();
    return { enRetard, aVenir, reglees };
  }, [plan, auj]);

  if (user?.role !== 'ADMIN') return <Navigate to="/dashboard" replace />;

  const moi = user?.id;
  const baremeActif = bareme.filter((b) => b.actif);
  const tacheDe = (id: string) => bareme.find((b) => b.id === id);

  // ---------- Actions plan ----------
  const ouvrirAjoutTache = () => {
    setFormT({ tacheId: '', dateLimite: auj, assigneeId: moi || '', quantite: 1, duree: '', note: '' });
    setModalTache({});
  };
  const ouvrirEditionTache = (t: TachePlan) => {
    setFormT({ tacheId: t.tacheId, dateLimite: jour(t.dateLimite), assigneeId: t.assigneeId, quantite: t.quantite, duree: t.duree ?? '', note: t.note || '', accordAutre: false });
    setModalTache({ edit: t });
  };
  const sauverTache = async () => {
    const payload: any = {
      tacheId: formT.tacheId, dateLimite: formT.dateLimite, assigneeId: formT.assigneeId,
      quantite: Number(formT.quantite) || 1,
      duree: formT.duree === '' ? null : Number(formT.duree),
      note: formT.note || null,
    };
    try {
      if (modalTache?.edit) {
        await apiFetch(`/gestion-temps/plan/${modalTache.edit.id}`, { method: 'PUT', body: JSON.stringify({ ...payload, accordAutre: !!formT.accordAutre }) });
      } else {
        await apiFetch('/gestion-temps/plan', { method: 'POST', body: JSON.stringify(payload) });
      }
      setModalTache(null);
      await chargerBase();
    } catch (e: any) { alert(e?.message || 'Erreur'); }
  };
  const ouvrirFait = (t: TachePlan) => {
    setFormF({ faitLe: auj, duree: t.duree ?? '', quantite: t.quantite, accordAutre: false });
    setModalFait(t);
  };
  const confirmerFait = async () => {
    if (!modalFait) return;
    try {
      await apiFetch(`/gestion-temps/plan/${modalFait.id}/fait`, {
        method: 'PATCH',
        body: JSON.stringify({
          faitLe: formF.faitLe,
          duree: formF.duree === '' ? null : Number(formF.duree),
          quantite: Number(formF.quantite) || 1,
          accordAutre: !!formF.accordAutre,
        }),
      });
      setModalFait(null);
      setInfo('Tâche réglée — points figés.');
      await chargerBase();
    } catch (e: any) { alert(e?.message || 'Erreur'); }
  };
  const annulerFait = async (t: TachePlan) => {
    if (!confirm(`Annuler le « fait » de « ${t.tache.nom} » (${t.points} pt à ${t.faitParNom}) ?`)) return;
    try { await apiFetch(`/gestion-temps/plan/${t.id}/annuler-fait`, { method: 'PATCH' }); await chargerBase(); }
    catch (e: any) { alert(e?.message || 'Erreur'); }
  };
  const supprimerTache = async (t: TachePlan) => {
    if (!confirm(`Retirer « ${t.tache.nom} » (échéance ${jour(t.dateLimite)}) du plan ?`)) return;
    try { await apiFetch(`/gestion-temps/plan/${t.id}`, { method: 'DELETE' }); await chargerBase(); }
    catch (e: any) { alert(e?.message || 'Erreur'); }
  };
  const genererMois = async () => {
    const [a, m] = auj.split('-').map(Number);
    try {
      const r = await apiFetch<{ crees: number }>('/gestion-temps/recurrentes/generer', { method: 'POST', body: JSON.stringify({ annee: a, mois: m }) });
      setInfo(`${r.crees} tâche(s) récurrente(s) générée(s) pour ${auj.slice(0, 7)} (les existantes ne sont jamais dupliquées).`);
      await chargerBase();
    } catch (e: any) { alert(e?.message || 'Erreur'); }
  };

  // ---------- Actions barème ----------
  const ouvrirAjoutBareme = () => { setFormB({ famille: 'DEVELOPPEMENT', nom: '', mode: 'FIXE', valeur: 0.25, supplement: 0, preuve: 'DECL', note: '' }); setModalBareme({}); };
  const ouvrirEditionBareme = (l: LigneBareme) => { setFormB({ ...l, note: l.note || '' }); setModalBareme({ edit: l }); };
  const sauverBareme = async () => {
    const payload = {
      famille: formB.famille, nom: formB.nom, mode: formB.mode,
      valeur: Number(formB.valeur), supplement: Number(formB.supplement) || 0,
      preuve: formB.preuve, note: formB.note || null, actif: formB.actif !== false,
    };
    try {
      if (modalBareme?.edit) await apiFetch(`/gestion-temps/bareme/${modalBareme.edit.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      else await apiFetch('/gestion-temps/bareme', { method: 'POST', body: JSON.stringify(payload) });
      setModalBareme(null);
      await chargerBase();
    } catch (e: any) { alert(e?.message || 'Erreur'); }
  };
  const supprimerBareme = async (l: LigneBareme) => {
    if (!confirm(`Retirer « ${l.nom} » du barème ?`)) return;
    try { const r = await apiFetch<any>(`/gestion-temps/bareme/${l.id}`, { method: 'DELETE' }); if (r?.message) setInfo(r.message); await chargerBase(); }
    catch (e: any) { alert(e?.message || 'Erreur'); }
  };

  // ---------- Actions récurrentes ----------
  const ouvrirAjoutRec = () => {
    setFormR({ tacheId: '', frequence: 'HEBDO', jourSemaine: 0, jourMois: 1, assigneeId: moi || '', alternance: false, premierId: '', secondId: '', ancrage: auj, note: '' });
    setModalRec({});
  };
  const ouvrirEditionRec = (r: any) => {
    setFormR({ tacheId: r.tacheId, frequence: r.frequence, jourSemaine: r.jourSemaine ?? 0, jourMois: r.jourMois ?? 1, assigneeId: r.assigneeId || '', alternance: r.alternance, premierId: r.premierId || '', secondId: r.secondId || '', ancrage: r.ancrage ? jour(r.ancrage) : auj, note: r.note || '', actif: r.actif });
    setModalRec({ edit: r });
  };
  const sauverRec = async () => {
    const payload: any = {
      tacheId: formR.tacheId, frequence: formR.frequence,
      jourSemaine: formR.frequence === 'HEBDO' ? Number(formR.jourSemaine) : null,
      jourMois: formR.frequence !== 'HEBDO' ? Number(formR.jourMois) : null,
      alternance: !!formR.alternance,
      assigneeId: formR.alternance ? null : formR.assigneeId,
      premierId: formR.alternance ? formR.premierId : null,
      secondId: formR.alternance ? formR.secondId : null,
      ancrage: formR.alternance ? formR.ancrage : null,
      note: formR.note || null,
      ...(modalRec?.edit ? { actif: formR.actif !== false } : {}),
    };
    try {
      if (modalRec?.edit) await apiFetch(`/gestion-temps/recurrentes/${modalRec.edit.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      else await apiFetch('/gestion-temps/recurrentes', { method: 'POST', body: JSON.stringify(payload) });
      setModalRec(null);
      await chargerBase();
    } catch (e: any) { alert(e?.message || 'Erreur'); }
  };
  const supprimerRec = async (r: any) => {
    if (!confirm(`Supprimer la récurrente « ${r.tache?.nom} » ? (les tâches déjà générées restent au plan)`)) return;
    try { await apiFetch(`/gestion-temps/recurrentes/${r.id}`, { method: 'DELETE' }); await chargerBase(); }
    catch (e: any) { alert(e?.message || 'Erreur'); }
  };

  // ---------- Acomptes ----------
  const ajouterAcompte = async () => {
    try {
      await apiFetch('/gestion-temps/acomptes', { method: 'POST', body: JSON.stringify({ userId: formAcompte.userId, montant: Number(formAcompte.montant), date: formAcompte.date, note: formAcompte.note || null }) });
      setFormAcompte(null);
      setTrimestre(null);
      const t = await apiFetch<any>(`/gestion-temps/trimestre?saison=${saison}&numero=${numero}`);
      setTrimestre(t);
    } catch (e: any) { alert(e?.message || 'Erreur'); }
  };

  const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

  const ligneTache = (t: TachePlan, enRetard: boolean) => (
    <li key={t.id} className={`p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-2 ${enRetard ? 'bg-red-50/60' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-cshp-black">{t.tache.nom}</span>
          <Badge variant={t.tache.preuve === 'APP' ? 'danger' : 'neutral'} className="!text-[10px]">{t.tache.preuve === 'APP' ? 'APP' : 'DÉCL'}</Badge>
          {t.recurrenteId && <Badge variant="neutral" className="!text-[10px]">récurrente</Badge>}
          {t.statut === 'REPRIS' && <Badge variant="warning" className="!text-[10px]">Reprise</Badge>}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          Échéance <strong>{jour(t.dateLimite)}</strong> · assignée à <strong>{t.assigneeNom}</strong>
          {t.quantite !== 1 ? ` · ×${t.quantite}` : ''}{t.duree ? ` · ${t.duree} h` : ''}
          {t.statut !== 'A_FAIRE' && <> · fait par <strong>{t.faitParNom}</strong> le {t.faitLe ? jour(t.faitLe) : ''} — <strong>{fmtPts(t.points || 0)} pt</strong></>}
        </p>
        {t.note && <p className="text-xs text-gray-400 italic mt-0.5">{t.note}</p>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {t.statut === 'A_FAIRE' ? (
          <>
            <button
              onClick={() => ouvrirFait(t)}
              className={`min-h-[40px] px-3 rounded-lg text-sm font-semibold flex items-center gap-1.5 ${t.assigneeId === moi ? 'bg-green-600 text-white active:bg-green-700' : 'border border-amber-400 text-amber-700 active:bg-amber-50'}`}
            >
              <Check size={16} /> {t.assigneeId === moi ? 'Fait' : 'Reprendre (100 %)'}
            </button>
            <button onClick={() => ouvrirEditionTache(t)} className="min-h-[40px] min-w-[40px] rounded-lg border border-gray-200 text-gray-600 flex items-center justify-center" title="Modifier (journalisé)"><Pencil size={15} /></button>
            <button onClick={() => supprimerTache(t)} className="min-h-[40px] min-w-[40px] rounded-lg border border-red-200 text-red-500 flex items-center justify-center" title="Supprimer (journalisé)"><Trash2 size={15} /></button>
          </>
        ) : (
          <button onClick={() => annulerFait(t)} className="min-h-[40px] px-3 rounded-lg border border-gray-200 text-gray-600 text-sm flex items-center gap-1.5" title="Annuler le fait (journalisé)"><Undo2 size={15} /> Annuler</button>
        )}
      </div>
    </li>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-cshp-black flex items-center gap-2">
          <Timer className="text-cshp-red" /> Points &amp; partage
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          L'entente de redevabilité, vivante : chaque tâche a une assignée et une date limite, les points suivent qui l'a
          réellement faite, et 100 % du bénéfice du trimestre se partage au prorata. Tout ce que l'app trace se compte
          tout seul ; toute modification est journalisée (Audit → Gestion du temps).
        </p>
      </div>

      {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg border border-red-100 text-sm">{error}</div>}
      {info && (
        <div className="p-3 bg-green-50 text-green-700 rounded-lg border border-green-100 text-sm flex justify-between items-center">
          <span>{info}</span><button onClick={() => setInfo('')} className="font-bold px-2">✕</button>
        </div>
      )}

      <div className="flex gap-2">
        {([['PLAN', 'Plan', ListChecks], ['TRIMESTRE', 'Trimestre', Scale], ['BAREME', 'Barème', Pencil]] as const).map(([code, label, Icone]) => (
          <button
            key={code}
            onClick={() => setOnglet(code)}
            className={`px-4 min-h-[42px] rounded-lg text-sm font-semibold flex items-center gap-1.5 ${onglet === code ? 'bg-cshp-black text-white' : 'bg-white border border-gray-300 text-cshp-gray'}`}
          >
            <Icone size={16} /> {label}
          </button>
        ))}
      </div>

      {isLoading ? <Spinner /> : (
        <>
          {/* ==================== PLAN ==================== */}
          {onglet === 'PLAN' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button onClick={ouvrirAjoutTache} className="!min-h-[42px]"><Plus size={17} className="mr-1" /> Tâche</Button>
                <Button variant="outline" onClick={genererMois} className="!min-h-[42px]"><RefreshCw size={15} className="mr-1" /> Générer les récurrentes du mois</Button>
                <Button variant="outline" onClick={() => setVoirRecurrentes(!voirRecurrentes)} className="!min-h-[42px]">
                  Récurrentes ({recurrentes.filter((r) => r.actif).length})
                </Button>
              </div>

              {voirRecurrentes && (
                <Card className="p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-cshp-black text-sm">Tâches récurrentes (gabarits)</h3>
                    <Button variant="outline" onClick={ouvrirAjoutRec} className="!min-h-[36px] !text-xs"><Plus size={14} className="mr-1" /> Récurrente</Button>
                  </div>
                  {recurrentes.length === 0 ? (
                    <p className="text-xs text-gray-400">Aucune — ajoutez le nettoyage en alternance, l'encaissement hebdo, la conciliation…</p>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {recurrentes.map((r) => (
                        <li key={r.id} className="py-2 flex items-center justify-between gap-2">
                          <div className="text-sm">
                            <span className={`font-medium ${r.actif ? 'text-cshp-black' : 'text-gray-400 line-through'}`}>{r.tache?.nom}</span>
                            <span className="text-xs text-gray-500 block">
                              {r.frequence === 'HEBDO' ? `Chaque ${JOURS[r.jourSemaine ?? 0].toLowerCase()}` : r.frequence === 'MENSUEL' ? `Le ${r.jourMois} du mois` : `Le ${r.jourMois} en fin de trimestre`}
                              {' · '}{r.alternance ? `alternance ${r.premierNom} → ${r.secondNom}` : r.assigneeNom}
                            </span>
                          </div>
                          <div className="flex gap-1.5">
                            <button onClick={() => ouvrirEditionRec(r)} className="p-2 rounded-lg border border-gray-200 text-gray-600"><Pencil size={14} /></button>
                            <button onClick={() => supprimerRec(r)} className="p-2 rounded-lg border border-red-200 text-red-500"><Trash2 size={14} /></button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              )}

              {groupes.enRetard.length > 0 && (
                <Card className="p-0 overflow-hidden border-red-200">
                  <div className="px-4 py-2.5 bg-red-50 border-b border-red-100 text-sm font-bold text-red-700">
                    ⚠️ En défaut ({groupes.enRetard.length}) — reprenables par l'autre à partir de J+3, 100 % des points
                  </div>
                  <ul className="divide-y divide-gray-100">{groupes.enRetard.map((t) => ligneTache(t, true))}</ul>
                </Card>
              )}

              <Card className="p-0 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-sm font-bold text-cshp-black">À venir ({groupes.aVenir.length})</div>
                {groupes.aVenir.length === 0 ? (
                  <p className="p-6 text-center text-sm text-gray-400">Rien au plan — ajoutez les tâches de la réunion mensuelle, ou générez les récurrentes.</p>
                ) : (
                  <ul className="divide-y divide-gray-100">{groupes.aVenir.map((t) => ligneTache(t, false))}</ul>
                )}
              </Card>

              {groupes.reglees.length > 0 && (
                <Card className="p-0 overflow-hidden">
                  <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-sm font-bold text-cshp-black">Réglées récemment</div>
                  <ul className="divide-y divide-gray-100">{groupes.reglees.map((t) => ligneTache(t, false))}</ul>
                </Card>
              )}
            </div>
          )}

          {/* ==================== TRIMESTRE ==================== */}
          {onglet === 'TRIMESTRE' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <select value={saison} onChange={(e) => { setSaison(Number(e.target.value)); setNumero(1); }} className="min-h-[42px] border border-gray-300 rounded-lg px-3 bg-white text-sm font-semibold">
                  {[saison - 1, saison, saison + 1].map((a) => <option key={a} value={a}>Saison {a}-{a + 1}</option>)}
                </select>
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} onClick={() => setNumero(n)} className={`min-h-[42px] px-4 rounded-lg text-sm font-bold ${numero === n ? 'bg-cshp-red text-white' : 'bg-white border border-gray-300 text-cshp-gray'}`}>T{n}</button>
                ))}
              </div>

              {chargeTrim || !trimestre ? <Spinner /> : (
                <>
                  {trimestre.drapeaux.length > 0 && (
                    <div className="space-y-2">
                      {trimestre.drapeaux.map((d: string, i: number) => (
                        <div key={i} className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-sm font-semibold">🚩 {d}</div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {trimestre.associes.map((a: Associe) => (
                      <Card key={a.id} className="p-4">
                        <div className="flex justify-between items-baseline">
                          <span className="font-bold text-cshp-black">👤 {a.nom}</span>
                          <span className="text-2xl font-black text-cshp-black">{fmtPts(trimestre.points[a.id] || 0)} <span className="text-sm font-semibold text-gray-400">pts</span></span>
                        </div>
                        <div className="mt-2 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full bg-cshp-red" style={{ width: `${Math.round((trimestre.ratios[a.id] || 0) * 100)}%` }} />
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                          <strong>{((trimestre.ratios[a.id] || 0) * 100).toFixed(1)} %</strong> du trimestre ·
                          automatique {fmtPts(trimestre.auto.totaux[a.id] || 0)} + plan {fmtPts(trimestre.plan[a.id]?.points || 0)}
                          {trimestre.horsListePct[a.id] > 0 && <> · hors-liste {trimestre.horsListePct[a.id]} %</>}
                        </p>
                        <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-3 gap-2 text-center">
                          <div><span className="block text-[10px] uppercase font-bold text-gray-400">Part</span><span className="font-bold">{fmt$(trimestre.parts[a.id] || 0)}</span></div>
                          <div><span className="block text-[10px] uppercase font-bold text-gray-400">Acomptes</span><span className="font-bold">{fmt$(trimestre.acomptes[a.id] || 0)}</span></div>
                          <div><span className="block text-[10px] uppercase font-bold text-gray-400">Solde</span><span className="font-bold text-cshp-red">{fmt$(trimestre.soldes[a.id] || 0)}</span></div>
                        </div>
                      </Card>
                    ))}
                  </div>

                  <Card className="p-4">
                    <h3 className="font-bold text-cshp-black text-sm mb-2">💰 L'argent du trimestre ({trimestre.debut} → {trimestre.fin})</h3>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
                      {trimestre.benefices.map((b: any) => (
                        <div key={`${b.annee}-${b.mois}`}>
                          <span className="block text-[10px] uppercase font-bold text-gray-400">{String(b.mois).padStart(2, '0')}/{b.annee}</span>
                          <span className={`font-bold ${b.montant < 0 ? 'text-red-600' : 'text-cshp-black'}`}>{fmt$(b.montant)}</span>
                        </div>
                      ))}
                      <div className="border-l border-gray-200">
                        <span className="block text-[10px] uppercase font-bold text-gray-400">Report antérieur</span>
                        <span className={`font-bold ${trimestre.report < 0 ? 'text-red-600' : 'text-cshp-black'}`}>{fmt$(trimestre.report)}</span>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                      <span>Bénéfice net encaissé : <strong>{fmt$(trimestre.benefice)}</strong></span>
                      <span>Base : <strong className={trimestre.base < 0 ? 'text-red-600' : ''}>{fmt$(trimestre.base)}</strong></span>
                      <span>Distribuable : <strong className="text-cshp-red">{fmt$(trimestre.distribuable)}</strong></span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-2">
                      Base « net » du Module financier (hors taxes, CTI/RTI récupérés) — provision TPS/TVQ et réserve d'un mois de charges à garder au compte
                      avant de verser. Report de déficit chaîné, ÉTEINT au 30 juin (le T4 repart à zéro). La part de propriété n'entre pas dans la formule.
                    </p>
                  </Card>

                  <Card className="p-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-bold text-cshp-black text-sm">Acomptes versés ce trimestre</h3>
                      <Button variant="outline" onClick={() => setFormAcompte({ userId: trimestre.associes[0]?.id || '', montant: '', date: auj, note: '' })} className="!min-h-[36px] !text-xs"><Plus size={14} className="mr-1" /> Acompte</Button>
                    </div>
                    <p className="text-xs text-gray-400">Suggestion de l'entente : ~50 % du bénéfice net du mois, au prorata des points du mois — jamais repris si le trimestre finit déficitaire.</p>
                  </Card>

                  <Card className="p-0 overflow-hidden">
                    <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-sm font-bold text-cshp-black">
                      Points automatiques — déduits des traces de l'app, aucune saisie
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[520px]">
                        <thead>
                          <tr className="text-left text-xs uppercase text-gray-500 bg-slate-50">
                            <th className="py-2 px-4">Ligne</th>
                            {trimestre.associes.map((a: Associe) => <th key={a.id} className="py-2 px-4 text-right">{a.nom}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {trimestre.auto.lignes.length === 0 && (
                            <tr><td colSpan={1 + trimestre.associes.length} className="py-5 px-4 text-center text-gray-400 text-xs">Encore rien sur la période — les pointages, encaissements, prospects, ventes… apparaîtront ici tout seuls.</td></tr>
                          )}
                          {trimestre.auto.lignes.map((l: any) => (
                            <tr key={l.code} className="border-t border-gray-100">
                              <td className="py-2 px-4">{l.nom}</td>
                              {trimestre.associes.map((a: Associe) => (
                                <td key={a.id} className="py-2 px-4 text-right">
                                  {l.parUser[a.id] ? <><strong>{fmtPts(l.parUser[a.id].points)}</strong> <span className="text-xs text-gray-400">(×{fmtPts(l.parUser[a.id].quantite)})</span></> : <span className="text-gray-300">—</span>}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </>
              )}
            </div>
          )}

          {/* ==================== BARÈME ==================== */}
          {onglet === 'BAREME' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <p className="text-xs text-gray-500 max-w-xl">
                  Modifiable librement par l'une ou l'autre — chaque changement est journalisé (avant → après) et n'est
                  <strong> jamais rétroactif</strong> : les points déjà figés ne bougent pas. Les lignes « auto » se
                  calculent toutes seules depuis l'app.
                </p>
                <Button onClick={ouvrirAjoutBareme} className="!min-h-[42px]"><Plus size={17} className="mr-1" /> Ligne</Button>
              </div>
              {FAMILLES.filter((f) => bareme.some((b) => b.famille === f)).map((f) => (
                <Card key={f} className="p-0 overflow-hidden">
                  <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-bold uppercase tracking-wide text-cshp-red">{f.replace('_', ' ')}</div>
                  <ul className="divide-y divide-gray-100">
                    {bareme.filter((b) => b.famille === f).map((l) => (
                      <li key={l.id} className="px-4 py-2.5 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm font-medium ${l.actif ? 'text-cshp-black' : 'text-gray-400 line-through'}`}>{l.nom}</span>
                          <span className="block text-xs text-gray-500">
                            {l.mode === 'DUREE' ? `${fmtPts(l.valeur)} pt × heure${l.supplement ? ` + ${fmtPts(l.supplement)}` : ''}` : `${fmtPts(l.valeur + l.supplement)} pt`}
                            {l.note ? ` · ${l.note}` : ''}
                          </span>
                        </div>
                        <Badge variant={l.preuve === 'APP' ? 'danger' : 'neutral'} className="!text-[10px] shrink-0">{l.preuve === 'APP' ? (l.code ? 'AUTO' : 'APP') : 'DÉCL'}</Badge>
                        <div className="flex gap-1.5 shrink-0">
                          <button onClick={() => ouvrirEditionBareme(l)} className="p-2 rounded-lg border border-gray-200 text-gray-600" title="Modifier (journalisé)"><Pencil size={14} /></button>
                          {!l.code && <button onClick={() => supprimerBareme(l)} className="p-2 rounded-lg border border-red-200 text-red-500" title="Supprimer"><Trash2 size={14} /></button>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* ==================== MODALES ==================== */}
      <Modal isOpen={!!modalTache} onClose={() => setModalTache(null)} title={modalTache?.edit ? 'Modifier la tâche (journalisé)' : 'Ajouter une tâche au plan'} width="lg">
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-semibold text-cshp-black mb-1">Tâche (du barème)</label>
            <select value={formT.tacheId || ''} onChange={(e) => setFormT({ ...formT, tacheId: e.target.value })} className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white text-sm">
              <option value="">— choisir —</option>
              {FAMILLES.map((f) => (
                <optgroup key={f} label={f.replace('_', ' ')}>
                  {baremeActif.filter((b) => b.famille === f && !b.code).map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
                </optgroup>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">Les lignes automatiques (pointages, encaissements…) ne se planifient pas : elles se comptent toutes seules.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Date limite" type="date" value={formT.dateLimite || ''} onChange={(e: any) => setFormT({ ...formT, dateLimite: e.target.value })} />
            <div>
              <label className="block text-sm font-semibold text-cshp-black mb-1">Assignée</label>
              <select value={formT.assigneeId || ''} onChange={(e) => setFormT({ ...formT, assigneeId: e.target.value })} className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white text-sm">
                {associes.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
              </select>
            </div>
            <Input label="Quantité" type="number" step="0.25" value={formT.quantite ?? 1} onChange={(e: any) => setFormT({ ...formT, quantite: e.target.value })} />
            {tacheDe(formT.tacheId)?.mode === 'DUREE' && (
              <Input label="Durée (h)" type="number" step="0.25" value={formT.duree ?? ''} onChange={(e: any) => setFormT({ ...formT, duree: e.target.value })} />
            )}
          </div>
          <Input label="Note" value={formT.note || ''} onChange={(e: any) => setFormT({ ...formT, note: e.target.value })} placeholder="Optionnel" />
          {modalTache?.edit && (
            <label className="flex items-start gap-2 text-xs text-cshp-black p-3 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer">
              <input type="checkbox" checked={!!formT.accordAutre} onChange={(e) => setFormT({ ...formT, accordAutre: e.target.checked })} className="mt-0.5 accent-cshp-red" />
              <span><strong>L'autre associée est d'accord.</strong> Requis seulement pour repousser sa propre échéance déjà en défaut (ou le jour même) — la garde anti-esquive de l'entente (art. 4.3.1).</span>
            </label>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setModalTache(null)}>Annuler</Button>
            <Button onClick={sauverTache} disabled={!formT.tacheId || !formT.dateLimite || !formT.assigneeId}>Enregistrer</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!modalFait} onClose={() => setModalFait(null)} title={modalFait && modalFait.assigneeId !== moi ? 'Reprendre la tâche (100 % des points)' : 'Marquer la tâche faite'}>
        {modalFait && (
          <div className="space-y-3">
            <p className="text-sm text-cshp-black"><strong>{modalFait.tache.nom}</strong> — assignée à {modalFait.assigneeNom}, échéance {jour(modalFait.dateLimite)}.</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Faite le" type="date" max={auj} value={formF.faitLe || ''} onChange={(e: any) => setFormF({ ...formF, faitLe: e.target.value })} />
              <Input label="Quantité" type="number" step="0.25" value={formF.quantite ?? 1} onChange={(e: any) => setFormF({ ...formF, quantite: e.target.value })} />
              {modalFait.tache.mode === 'DUREE' && (
                <Input label="Durée (h)" type="number" step="0.25" value={formF.duree ?? ''} onChange={(e: any) => setFormF({ ...formF, duree: e.target.value })} />
              )}
            </div>
            {modalFait.assigneeId !== moi && (
              <label className="flex items-start gap-2 text-xs text-cshp-black p-3 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer">
                <input type="checkbox" checked={!!formF.accordAutre} onChange={(e) => setFormF({ ...formF, accordAutre: e.target.checked })} className="mt-0.5 accent-cshp-red" />
                <span><strong>Avec l'accord de l'assignée</strong> — permet de reprendre AVANT J+3 (sinon la reprise s'ouvre 3 jours après l'échéance).</span>
              </label>
            )}
            <p className="text-[11px] text-gray-400">Les points se figent maintenant, selon le barème du jour — un changement de barème ultérieur ne les réécrira pas.</p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setModalFait(null)}>Annuler</Button>
              <Button onClick={confirmerFait}>{modalFait.assigneeId !== moi ? 'Reprendre' : 'Fait ✓'}</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!modalBareme} onClose={() => setModalBareme(null)} title={modalBareme?.edit ? 'Modifier la ligne (journalisé, jamais rétroactif)' : 'Ajouter une ligne au barème'} width="lg">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-cshp-black mb-1">Famille</label>
              <select value={formB.famille || ''} onChange={(e) => setFormB({ ...formB, famille: e.target.value })} className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white text-sm">
                {FAMILLES.map((f) => <option key={f} value={f}>{f.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-cshp-black mb-1">Preuve</label>
              <select value={formB.preuve || 'DECL'} onChange={(e) => setFormB({ ...formB, preuve: e.target.value })} className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white text-sm">
                <option value="DECL">Déclaration (DÉCL)</option>
                <option value="APP">Trace de l'app (APP)</option>
              </select>
            </div>
          </div>
          <Input label="Nom de la tâche" value={formB.nom || ''} onChange={(e: any) => setFormB({ ...formB, nom: e.target.value })} />
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-semibold text-cshp-black mb-1">Mode</label>
              <select value={formB.mode || 'FIXE'} onChange={(e) => setFormB({ ...formB, mode: e.target.value })} className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white text-sm">
                <option value="FIXE">Forfait (points fixes)</option>
                <option value="DUREE">Heures réelles (× durée)</option>
              </select>
            </div>
            <Input label={formB.mode === 'DUREE' ? 'Coefficient ×h' : 'Points'} type="number" step="0.05" value={formB.valeur ?? ''} onChange={(e: any) => setFormB({ ...formB, valeur: e.target.value })} />
            <Input label="Supplément" type="number" step="0.05" value={formB.supplement ?? 0} onChange={(e: any) => setFormB({ ...formB, supplement: e.target.value })} />
          </div>
          <Input label="Note" value={formB.note || ''} onChange={(e: any) => setFormB({ ...formB, note: e.target.value })} placeholder="Plafond, condition, précision…" />
          {modalBareme?.edit && (
            <label className="flex items-center gap-2 text-sm text-cshp-black cursor-pointer">
              <input type="checkbox" checked={formB.actif !== false} onChange={(e) => setFormB({ ...formB, actif: e.target.checked })} className="accent-cshp-red" />
              Ligne active
            </label>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setModalBareme(null)}>Annuler</Button>
            <Button onClick={sauverBareme} disabled={!formB.nom || formB.valeur === ''}>Enregistrer</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!modalRec} onClose={() => setModalRec(null)} title={modalRec?.edit ? 'Modifier la récurrente (journalisé)' : 'Ajouter une tâche récurrente'} width="lg">
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-semibold text-cshp-black mb-1">Tâche (du barème)</label>
            <select value={formR.tacheId || ''} onChange={(e) => setFormR({ ...formR, tacheId: e.target.value })} className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white text-sm">
              <option value="">— choisir —</option>
              {FAMILLES.map((f) => (
                <optgroup key={f} label={f.replace('_', ' ')}>
                  {baremeActif.filter((b) => b.famille === f && !b.code).map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-cshp-black mb-1">Fréquence</label>
              <select value={formR.frequence || 'HEBDO'} onChange={(e) => setFormR({ ...formR, frequence: e.target.value })} className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white text-sm">
                <option value="HEBDO">Chaque semaine</option>
                <option value="MENSUEL">Chaque mois</option>
                <option value="TRIMESTRIEL">Chaque fin de trimestre (nov, fév, mai, août)</option>
              </select>
            </div>
            {formR.frequence === 'HEBDO' ? (
              <div>
                <label className="block text-sm font-semibold text-cshp-black mb-1">Jour</label>
                <select value={formR.jourSemaine ?? 0} onChange={(e) => setFormR({ ...formR, jourSemaine: e.target.value })} className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white text-sm">
                  {JOURS.map((j, i) => <option key={i} value={i}>{j}</option>)}
                </select>
              </div>
            ) : (
              <Input label="Jour du mois (1-28)" type="number" value={formR.jourMois ?? 1} onChange={(e: any) => setFormR({ ...formR, jourMois: e.target.value })} />
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-cshp-black cursor-pointer">
            <input type="checkbox" checked={!!formR.alternance} onChange={(e) => setFormR({ ...formR, alternance: e.target.checked })} className="accent-cshp-red" />
            En alternance entre les deux associées (ex. le nettoyage)
          </label>
          {formR.alternance ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-cshp-black mb-1">Commence</label>
                <select value={formR.premierId || ''} onChange={(e) => setFormR({ ...formR, premierId: e.target.value, secondId: associes.find((a) => a.id !== e.target.value)?.id || '' })} className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white text-sm">
                  <option value="">—</option>
                  {associes.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
                </select>
              </div>
              <Input label="À partir du (ancrage)" type="date" value={formR.ancrage || ''} onChange={(e: any) => setFormR({ ...formR, ancrage: e.target.value })} />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-semibold text-cshp-black mb-1">Assignée</label>
              <select value={formR.assigneeId || ''} onChange={(e) => setFormR({ ...formR, assigneeId: e.target.value })} className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white text-sm">
                {associes.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
              </select>
            </div>
          )}
          <Input label="Note" value={formR.note || ''} onChange={(e: any) => setFormR({ ...formR, note: e.target.value })} placeholder="Optionnel" />
          {modalRec?.edit && (
            <label className="flex items-center gap-2 text-sm text-cshp-black cursor-pointer">
              <input type="checkbox" checked={formR.actif !== false} onChange={(e) => setFormR({ ...formR, actif: e.target.checked })} className="accent-cshp-red" />
              Active (générée chaque mois)
            </label>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setModalRec(null)}>Annuler</Button>
            <Button onClick={sauverRec} disabled={!formR.tacheId || (formR.alternance ? !formR.premierId : !formR.assigneeId)}>Enregistrer</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!formAcompte} onClose={() => setFormAcompte(null)} title="Verser un acompte (journalisé)">
        {formAcompte && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-semibold text-cshp-black mb-1">À</label>
              <select value={formAcompte.userId} onChange={(e) => setFormAcompte({ ...formAcompte, userId: e.target.value })} className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white text-sm">
                {associes.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Montant ($)" type="number" step="0.01" value={formAcompte.montant} onChange={(e: any) => setFormAcompte({ ...formAcompte, montant: e.target.value })} />
              <Input label="Date" type="date" value={formAcompte.date} onChange={(e: any) => setFormAcompte({ ...formAcompte, date: e.target.value })} />
            </div>
            <Input label="Note" value={formAcompte.note} onChange={(e: any) => setFormAcompte({ ...formAcompte, note: e.target.value })} placeholder="ex. acompte de septembre" />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setFormAcompte(null)}>Annuler</Button>
              <Button onClick={ajouterAcompte} disabled={!formAcompte.montant}>Verser</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
