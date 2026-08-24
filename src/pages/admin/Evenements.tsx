import { useEffect, useMemo, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { apiFetch } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { saisonCourante, saisonsChoix } from '../../lib/saison';
import { useSections } from '../../hooks/useSections';
import { SourcesCalendrier } from '../../components/calendrier/SourcesCalendrier';
import { Trophy, Plus, Pencil, Trash2, ArrowLeft, UserPlus, ShieldCheck, AlertTriangle } from 'lucide-react';

interface Evenement {
  id: string;
  titre: string;
  type: string;
  discipline: string | null;
  date: string;
  lieu: string | null;
  fraisInscription: number | null;
  note: string | null;
  actif: boolean;
  _count?: { inscriptions: number };
}

interface Admissibilite {
  saisonRequise: string;
  affiliationOk: boolean | null; // null = pas de contrôle (discipline sans fédération)
  affiliation: { id: string; numero: string | null; saison: string } | null;
  solde: { total: number; enRetard: number; renouvellementEchu: boolean; finContrat: string | null } | null;
}

interface Inscription {
  id: string;
  membreId: string;
  fraisPaye: boolean;
  note: string | null;
  member: { id: string; firstName: string; lastName: string; status: string; sections: { section: string }[] };
  admissibilite: Admissibilite;
}

interface EvenementDetail extends Evenement {
  saisonRequise: string;
  inscriptions: Inscription[];
}

interface Affiliation {
  id: string;
  membreId: string;
  discipline: string;
  saison: string;
  numero: string | null;
  montant: number | null;
  datePaiement: string | null;
  note: string | null;
  member?: { id: string; firstName: string; lastName: string; status: string; sections: { section: string }[] };
}

interface MembreLight {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
}

const TYPES = [
  { value: 'COMPETITION', label: 'Compétition' },
  { value: 'PASSAGE_GRADE', label: 'Passage de grade' },
  { value: 'AUTRE', label: 'Événement spécial' },
];
const DISCIPLINES = [
  { value: 'KARATE', label: 'Karaté' },
  { value: 'JUDO', label: 'Judo' },
  { value: 'NINJAS', label: 'Ninjas' },
  { value: 'TOUS', label: 'Tous' },
];
const labelType = (v: string) => TYPES.find((t) => t.value === v)?.label || v;
const labelDiscipline = (v: string | null) => DISCIPLINES.find((d) => d.value === v)?.label || v || '—';
const fmtMontant = (n: number) => n.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('fr-CA', { timeZone: 'America/Toronto', day: 'numeric', month: 'long', year: 'numeric' });
const selectClass = 'min-h-[44px] w-full border border-gray-300 rounded-lg px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-cshp-red';

const todayLocalISO = () => new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto' }).format(new Date());
const FORM_EVENEMENT_VIDE = { titre: '', type: 'COMPETITION', discipline: 'KARATE', date: '', lieu: '', fraisInscription: '', note: '' };

// Recherche de membre réutilisée (inscription à un événement / nouvelle affiliation).
function RechercheMembre({ membres, onChoisir, placeholder }: { membres: MembreLight[]; onChoisir: (m: MembreLight) => void; placeholder?: string }) {
  const [q, setQ] = useState('');
  const resultats = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return membres.filter((m) => `${m.firstName} ${m.lastName}`.toLowerCase().includes(t)).slice(0, 8);
  }, [membres, q]);
  return (
    <div>
      <input
        className="min-h-[44px] w-full border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-cshp-red"
        placeholder={placeholder || 'Rechercher un athlète…'}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {resultats.length > 0 && (
        <div className="mt-1 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto bg-white">
          {resultats.map((m) => (
            <button
              key={m.id}
              onClick={() => { onChoisir(m); setQ(''); }}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm"
            >
              {m.firstName} {m.lastName}
              {m.status !== 'ACTIF' && <span className="ml-2 text-xs text-gray-400">({m.status})</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Badges d'admissibilité d'un inscrit : affiliation fédération + solde dû au club.
function BadgesAdmissibilite({ adm }: { adm: Admissibilite }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {adm.affiliationOk === true && (
        <Badge variant="success" className="!inline-flex gap-1"><ShieldCheck size={12} /> Affilié {adm.affiliation?.saison}{adm.affiliation?.numero ? ` · n° ${adm.affiliation.numero}` : ''}</Badge>
      )}
      {adm.affiliationOk === false && (
        <Badge variant="danger" className="!inline-flex gap-1"><AlertTriangle size={12} /> Non affilié {adm.saisonRequise}</Badge>
      )}
      {adm.solde && adm.solde.total > 0 && (
        <Badge variant="danger">Doit {fmtMontant(adm.solde.total)} au club{adm.solde.enRetard > 0 ? ` (${fmtMontant(adm.solde.enRetard)} en retard)` : ''}</Badge>
      )}
      {adm.solde && adm.solde.renouvellementEchu && (
        <Badge variant="warning">Renouvellement échu</Badge>
      )}
    </div>
  );
}

export function Evenements() {
  const { user } = useAuth();
  const { sections: toutesSections } = useSections();
  const [onglet, setOnglet] = useState<'evenements' | 'affiliations'>('evenements');
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [detail, setDetail] = useState<EvenementDetail | null>(null);
  const [membres, setMembres] = useState<MembreLight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [voirPasses, setVoirPasses] = useState(false);

  // Modal événement (création / édition)
  const [modalEvenement, setModalEvenement] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...FORM_EVENEMENT_VIDE });
  const [saving, setSaving] = useState(false);

  // Affiliations
  const [affiliations, setAffiliations] = useState<Affiliation[]>([]);
  const [saisonSel, setSaisonSel] = useState(saisonCourante());
  const [filtreDisciplineAff, setFiltreDisciplineAff] = useState('TOUTES');
  const [modalAffiliation, setModalAffiliation] = useState(false);
  const [affForm, setAffForm] = useState({ membreId: '', membreNom: '', discipline: 'KARATE', saison: saisonCourante(), numero: '', montant: '', datePaiement: '', note: '' });

  const loadEvenements = async () => {
    setIsLoading(true);
    try {
      setEvenements(await apiFetch<Evenement[]>('/evenements'));
    } catch (err: any) {
      setError(err?.message || 'Erreur de chargement');
    } finally {
      setIsLoading(false);
    }
  };

  const loadDetail = async (id: string) => {
    try {
      setDetail(await apiFetch<EvenementDetail>(`/evenements/${id}`));
    } catch (err: any) {
      setError(err?.message || 'Erreur de chargement');
    }
  };

  const loadAffiliations = async () => {
    try {
      const res = await apiFetch<{ saisonCourante: string; affiliations: Affiliation[] }>(`/affiliations?saison=${saisonSel}`);
      setAffiliations(res.affiliations);
    } catch (err: any) {
      setError(err?.message || 'Erreur de chargement');
    }
  };

  useEffect(() => {
    if (user) {
      loadEvenements();
      apiFetch<MembreLight[]>('/membres').then(setMembres).catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    if (user && onglet === 'affiliations') loadAffiliations();
  }, [user, onglet, saisonSel]);

  const { aVenir, passes } = useMemo(() => {
    const auj = todayLocalISO();
    const aVenir = evenements.filter((e) => e.date.slice(0, 10) >= auj).sort((a, b) => a.date.localeCompare(b.date));
    const passes = evenements.filter((e) => e.date.slice(0, 10) < auj);
    return { aVenir, passes };
  }, [evenements]);

  const affiliationsVisibles = useMemo(
    () => (filtreDisciplineAff === 'TOUTES' ? affiliations : affiliations.filter((a) => a.discipline === filtreDisciplineAff)),
    [affiliations, filtreDisciplineAff]
  );

  if (!user) return <Navigate to="/dashboard" replace />;
  // Personnel non admin : portée limitée à SES disciplines (sections attitrées,
  // séparées par des virgules sur le compte) — le serveur refuse le reste.
  const estAdmin = user.role === 'ADMIN';
  const sportsConnus = new Set(toutesSections.map((s) => (s.sport || '').toUpperCase()));
  const sportsStaff = estAdmin ? [] : [...new Set(
    (user.section || '')
      .split(/[;,]/)
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean)
      .map((code) => {
        const propre = toutesSections.find((s) => s.code.toUpperCase() === code);
        const racine = code.split(/[_\s-]/)[0];
        return propre ? (propre.sport || '').toUpperCase() : sportsConnus.has(code) ? code : sportsConnus.has(racine) ? racine : null;
      })
      .filter(Boolean) as string[]
  )];
  const peutGerer = (discipline: string | null) => estAdmin || (!!discipline && sportsStaff.includes(discipline));
  const disciplinesForm = estAdmin ? DISCIPLINES : DISCIPLINES.filter((d) => sportsStaff.includes(d.value));

  // ---------- Événements ----------

  const ouvrirCreation = () => {
    setEditId(null);
    setForm({ ...FORM_EVENEMENT_VIDE, discipline: (estAdmin ? FORM_EVENEMENT_VIDE.discipline : sportsStaff[0]) || FORM_EVENEMENT_VIDE.discipline, date: todayLocalISO() });
    setModalEvenement(true);
  };

  const ouvrirEdition = (e: Evenement) => {
    setEditId(e.id);
    setForm({
      titre: e.titre,
      type: e.type,
      discipline: e.discipline || 'TOUS',
      date: e.date.slice(0, 10),
      lieu: e.lieu || '',
      fraisInscription: e.fraisInscription != null ? String(e.fraisInscription) : '',
      note: e.note || '',
    });
    setModalEvenement(true);
  };

  const sauverEvenement = async () => {
    if (!form.titre.trim() || !form.date) {
      setError('Titre et date requis.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const frais = form.fraisInscription.trim() === '' ? null : parseFloat(form.fraisInscription.replace(',', '.'));
      const body = {
        titre: form.titre.trim(),
        type: form.type,
        discipline: form.discipline,
        date: form.date,
        lieu: form.lieu.trim() || null,
        fraisInscription: frais != null && !isNaN(frais) ? frais : null,
        note: form.note.trim() || null,
      };
      if (editId) await apiFetch(`/evenements/${editId}`, { method: 'PUT', body: JSON.stringify(body) });
      else await apiFetch('/evenements', { method: 'POST', body: JSON.stringify(body) });
      setModalEvenement(false);
      await loadEvenements();
      if (detail && editId === detail.id) await loadDetail(detail.id);
    } catch (err: any) {
      setError(err?.message || 'Erreur de sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const supprimerEvenement = async (e: Evenement) => {
    if (!confirm(`Supprimer « ${e.titre} » ?`)) return;
    try {
      const res = await apiFetch<{ message: string }>(`/evenements/${e.id}`, { method: 'DELETE' });
      setInfo(res.message);
      setDetail(null);
      await loadEvenements();
    } catch (err: any) {
      setError(err?.message || 'Erreur de suppression');
    }
  };

  const inscrire = async (m: MembreLight) => {
    if (!detail) return;
    try {
      const res = await apiFetch<{ admissibilite: Admissibilite | null }>(`/evenements/${detail.id}/inscriptions`, {
        method: 'POST',
        body: JSON.stringify({ membreId: m.id }),
      });
      const adm = res.admissibilite;
      const alertes: string[] = [];
      if (adm?.affiliationOk === false) alertes.push(`non affilié ${adm.saisonRequise}`);
      if (adm?.solde?.total) alertes.push(`doit ${fmtMontant(adm.solde.total)} au club`);
      if (adm?.solde?.renouvellementEchu) alertes.push('renouvellement échu');
      setInfo(alertes.length > 0 ? `${m.firstName} ${m.lastName} inscrit — ⚠️ ${alertes.join(', ')}.` : `${m.firstName} ${m.lastName} inscrit.`);
      await loadDetail(detail.id);
      await loadEvenements();
    } catch (err: any) {
      setError(err?.message || "Erreur d'inscription");
    }
  };

  const basculerFrais = async (i: Inscription) => {
    if (!detail) return;
    try {
      await apiFetch(`/evenements/${detail.id}/inscriptions/${i.id}`, { method: 'PATCH', body: JSON.stringify({ fraisPaye: !i.fraisPaye }) });
      await loadDetail(detail.id);
    } catch (err: any) {
      setError(err?.message || 'Erreur');
    }
  };

  const retirerInscription = async (i: Inscription) => {
    if (!detail) return;
    if (!confirm(`Retirer ${i.member.firstName} ${i.member.lastName} de cet événement ?`)) return;
    try {
      await apiFetch(`/evenements/${detail.id}/inscriptions/${i.id}`, { method: 'DELETE' });
      await loadDetail(detail.id);
      await loadEvenements();
    } catch (err: any) {
      setError(err?.message || 'Erreur');
    }
  };

  // ---------- Affiliations ----------

  const sauverAffiliation = async () => {
    if (!affForm.membreId) {
      setError('Choisissez un athlète.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const montant = affForm.montant.trim() === '' ? null : parseFloat(affForm.montant.replace(',', '.'));
      await apiFetch('/affiliations', {
        method: 'POST',
        body: JSON.stringify({
          membreId: affForm.membreId,
          discipline: affForm.discipline,
          saison: affForm.saison,
          numero: affForm.numero.trim() || null,
          montant: montant != null && !isNaN(montant) ? montant : null,
          datePaiement: affForm.datePaiement || null,
          note: affForm.note.trim() || null,
        }),
      });
      setModalAffiliation(false);
      setAffForm({ membreId: '', membreNom: '', discipline: 'KARATE', saison: saisonSel, numero: '', montant: '', datePaiement: '', note: '' });
      await loadAffiliations();
      if (detail) await loadDetail(detail.id);
    } catch (err: any) {
      setError(err?.message || 'Erreur de sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const supprimerAffiliation = async (a: Affiliation) => {
    const nom = a.member ? `${a.member.firstName} ${a.member.lastName}` : '';
    if (!confirm(`Supprimer l'affiliation ${labelDiscipline(a.discipline)} ${a.saison} de ${nom} ?`)) return;
    try {
      await apiFetch(`/affiliations/${a.id}`, { method: 'DELETE' });
      await loadAffiliations();
    } catch (err: any) {
      setError(err?.message || 'Erreur de suppression');
    }
  };

  const carteEvenement = (e: Evenement) => (
    <button
      key={e.id}
      onClick={() => loadDetail(e.id)}
      className="w-full text-left p-4 rounded-xl border border-gray-100 bg-white hover:border-cshp-red/40 hover:shadow-sm transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-cshp-black">{e.titre}</div>
          <div className="text-sm text-gray-500 mt-0.5">
            {fmtDate(e.date)}{e.lieu ? ` · ${e.lieu}` : ''}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={e.type === 'COMPETITION' ? 'danger' : e.type === 'PASSAGE_GRADE' ? 'warning' : 'neutral'}>{labelType(e.type)}</Badge>
          <span className="text-xs text-gray-400">{labelDiscipline(e.discipline)} · {e._count?.inscriptions ?? 0} inscrit(s)</span>
        </div>
      </div>
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-cshp-black">Événements & affiliations</h1>
          <p className="text-sm text-gray-500 mt-1">
            Compétitions, passages de grade, affiliations fédération (saison septembre → août). Frais et affiliations transitent vers la fédération : <strong>pas des revenus du club</strong>.
          </p>
        </div>
        {onglet === 'evenements' ? (
          <Button onClick={ouvrirCreation} className="!min-h-0 h-10"><Plus size={18} className="mr-1" /> Nouvel événement</Button>
        ) : (
          (estAdmin || sportsStaff.some((d) => d === 'KARATE' || d === 'JUDO')) ? (
            <Button onClick={() => { setAffForm({ ...affForm, discipline: estAdmin ? affForm.discipline : (sportsStaff.find((d) => d === 'KARATE' || d === 'JUDO') as string), saison: saisonSel }); setModalAffiliation(true); }} className="!min-h-0 h-10"><Plus size={18} className="mr-1" /> Nouvelle affiliation</Button>
          ) : <span />
        )}
      </div>

      {estAdmin && <SourcesCalendrier />}

      {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg border border-red-100 text-sm">{error}</div>}
      {info && (
        <div className="p-3 bg-green-50 text-green-700 rounded-lg border border-green-100 text-sm flex justify-between items-center">
          <span>{info}</span>
          <button onClick={() => setInfo('')} className="text-green-700 font-bold px-2 cursor-pointer">✕</button>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => { setOnglet('evenements'); }}
          className={`px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer ${onglet === 'evenements' ? 'bg-cshp-black text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          <Trophy size={14} className="inline mr-1 -mt-0.5" /> Événements
        </button>
        <button
          onClick={() => { setOnglet('affiliations'); setDetail(null); }}
          className={`px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer ${onglet === 'affiliations' ? 'bg-cshp-black text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          <ShieldCheck size={14} className="inline mr-1 -mt-0.5" /> Affiliations
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : onglet === 'evenements' ? (
        detail ? (
          // ---------- Détail d'un événement ----------
          <div className="space-y-4">
            <button onClick={() => setDetail(null)} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-cshp-black cursor-pointer">
              <ArrowLeft size={16} /> Retour aux événements
            </button>
            <Card className="p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-bold text-cshp-black">{detail.titre}</h2>
                    <Badge variant={detail.type === 'COMPETITION' ? 'danger' : detail.type === 'PASSAGE_GRADE' ? 'warning' : 'neutral'}>{labelType(detail.type)}</Badge>
                    {!detail.actif && <Badge variant="neutral">Archivé</Badge>}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {fmtDate(detail.date)}{detail.lieu ? ` · ${detail.lieu}` : ''} · {labelDiscipline(detail.discipline)}
                    {detail.fraisInscription != null && ` · Frais : ${fmtMontant(detail.fraisInscription)} (fédération)`}
                  </p>
                  {detail.note && <p className="text-sm text-gray-500 mt-1">{detail.note}</p>}
                  {(detail.discipline === 'KARATE' || detail.discipline === 'JUDO') && (
                    <p className="text-xs text-gray-400 mt-1">Affiliation requise : saison {detail.saisonRequise}</p>
                  )}
                </div>
                {peutGerer(detail.discipline) && (
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => ouvrirEdition(detail)} className="!min-h-0 h-9 text-sm"><Pencil size={15} className="mr-1" /> Modifier</Button>
                    <Button variant="secondary" onClick={() => supprimerEvenement(detail)} className="!min-h-0 h-9 text-sm !text-red-600"><Trash2 size={15} className="mr-1" /> Supprimer</Button>
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold text-cshp-black">Participants ({detail.inscriptions.length})</h3>
              </div>
              {peutGerer(detail.discipline) && (
                <div className="max-w-md">
                  <label className="block text-sm font-medium text-gray-600 mb-1"><UserPlus size={14} className="inline mr-1 -mt-0.5" />Inscrire un athlète</label>
                  <RechercheMembre membres={membres.filter((m) => !detail.inscriptions.some((i) => i.membreId === m.id))} onChoisir={inscrire} />
                </div>
              )}

              {detail.inscriptions.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-100">
                        <th className="py-2 pr-3">Athlète</th>
                        <th className="py-2 pr-3">Groupe</th>
                        <th className="py-2 pr-3">Admissibilité</th>
                        <th className="py-2 pr-3 text-center" title="Frais d'inscription remis (transitent vers la fédération)">Frais remis</th>
                        <th className="py-2 text-right"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.inscriptions.map((i) => (
                        <tr key={i.id} className="border-b border-gray-50 align-top">
                          <td className="py-2.5 pr-3">
                            <Link to={`/membres/${i.member.id}`} className="font-medium text-cshp-black hover:text-cshp-red">
                              {i.member.firstName} {i.member.lastName}
                            </Link>
                            {i.member.status !== 'ACTIF' && <span className="ml-1 text-xs text-gray-400">({i.member.status})</span>}
                          </td>
                          <td className="py-2.5 pr-3 text-gray-500">{i.member.sections.map((s) => s.section).join(', ') || '—'}</td>
                          <td className="py-2.5 pr-3"><BadgesAdmissibilite adm={i.admissibilite} /></td>
                          <td className="py-2.5 pr-3 text-center">
                            <input type="checkbox" checked={i.fraisPaye} disabled={!peutGerer(detail.discipline)} onChange={() => basculerFrais(i)} className="w-4 h-4 accent-cshp-red cursor-pointer disabled:cursor-default" />
                          </td>
                          <td className="py-2.5 text-right">
                            {peutGerer(detail.discipline) && <button onClick={() => retirerInscription(i)} className="p-2 rounded-lg hover:bg-red-50 text-red-500 cursor-pointer" title="Retirer"><Trash2 size={15} /></button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        ) : (
          // ---------- Liste des événements ----------
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-cshp-black mb-2">À venir ({aVenir.length})</h3>
              {aVenir.length === 0 ? (
                <p className="text-sm text-gray-400 py-4">Aucun événement à venir. Créez-en un avec « Nouvel événement ».</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{aVenir.map(carteEvenement)}</div>
              )}
            </div>
            <div>
              <button onClick={() => setVoirPasses((v) => !v)} className="text-sm font-semibold text-gray-500 hover:text-cshp-black cursor-pointer">
                {voirPasses ? '▾' : '▸'} Passés ({passes.length})
              </button>
              {voirPasses && passes.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">{passes.map(carteEvenement)}</div>
              )}
            </div>
          </div>
        )
      ) : (
        // ---------- Affiliations ----------
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Saison</label>
              <select className={selectClass} value={saisonSel} onChange={(e) => setSaisonSel(e.target.value)}>
                {saisonsChoix().map((s) => <option key={s} value={s}>{s}{s === saisonCourante() ? ' (courante)' : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Discipline</label>
              <select className={selectClass} value={filtreDisciplineAff} onChange={(e) => setFiltreDisciplineAff(e.target.value)}>
                <option value="TOUTES">Toutes</option>
                <option value="KARATE">Karaté</option>
                <option value="JUDO">Judo</option>
              </select>
            </div>
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="py-3 px-4">Athlète</th>
                  <th className="py-3 px-2">Discipline</th>
                  <th className="py-3 px-2">N° fédération</th>
                  <th className="py-3 px-2 text-right" title="Montant remis à la fédération — pas un revenu du club">Montant (fédé)</th>
                  <th className="py-3 px-2">Payée le</th>
                  <th className="py-3 px-2 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {affiliationsVisibles.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-gray-400">Aucune affiliation pour la saison {saisonSel}.</td></tr>
                )}
                {affiliationsVisibles.map((a) => (
                  <tr key={a.id} className="border-b border-gray-50">
                    <td className="py-2.5 px-4">
                      {a.member ? (
                        <Link to={`/membres/${a.member.id}`} className="font-medium text-cshp-black hover:text-cshp-red">
                          {a.member.firstName} {a.member.lastName}
                        </Link>
                      ) : '—'}
                      {a.note && <div className="text-xs text-gray-400">{a.note}</div>}
                    </td>
                    <td className="py-2.5 px-2">{labelDiscipline(a.discipline)}</td>
                    <td className="py-2.5 px-2">{a.numero || '—'}</td>
                    <td className="py-2.5 px-2 text-right">{a.montant != null ? fmtMontant(a.montant) : '—'}</td>
                    <td className="py-2.5 px-2">{a.datePaiement ? new Date(a.datePaiement).toLocaleDateString('fr-CA', { timeZone: 'America/Toronto' }) : '—'}</td>
                    <td className="py-2.5 px-2 text-right">
                      <button onClick={() => supprimerAffiliation(a)} className="p-2 rounded-lg hover:bg-red-50 text-red-500 cursor-pointer" title="Supprimer"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-400 px-4 py-3">
              L'affiliation détermine l'admissibilité aux compétitions de la saison. Les montants vont à la fédération et ne comptent <strong>jamais</strong> dans les revenus du club.
            </p>
          </Card>
        </div>
      )}

      {/* Modal événement */}
      <Modal isOpen={modalEvenement} onClose={() => setModalEvenement(false)} title={editId ? 'Modifier l’événement' : 'Nouvel événement'} width="lg">
        <div className="space-y-4">
          <Input label="Titre *" value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} placeholder="Championnat provincial…" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Type *</label>
              <select className={selectClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Discipline</label>
              <select className={selectClass} value={form.discipline} onChange={(e) => setForm({ ...form, discipline: e.target.value })} disabled={!estAdmin && disciplinesForm.length <= 1}>
                {disciplinesForm.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <Input label="Date *" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <Input label="Lieu" value={form.lieu} onChange={(e) => setForm({ ...form, lieu: e.target.value })} placeholder="Centre Claude-Robillard…" />
            <Input label="Frais d'inscription $ (fédération)" inputMode="decimal" value={form.fraisInscription} onChange={(e) => setForm({ ...form, fraisInscription: e.target.value })} placeholder="Optionnel" />
          </div>
          <Input label="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalEvenement(false)}>Annuler</Button>
            <Button onClick={sauverEvenement} disabled={saving}>{saving ? 'Sauvegarde…' : 'Sauvegarder'}</Button>
          </div>
        </div>
      </Modal>

      {/* Modal affiliation */}
      <Modal isOpen={modalAffiliation} onClose={() => setModalAffiliation(false)} title="Nouvelle affiliation" width="lg">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Athlète *</label>
            {affForm.membreId ? (
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="font-medium">{affForm.membreNom}</span>
                <button onClick={() => setAffForm({ ...affForm, membreId: '', membreNom: '' })} className="text-sm text-red-500 cursor-pointer">Changer</button>
              </div>
            ) : (
              <RechercheMembre membres={membres} onChoisir={(m) => setAffForm({ ...affForm, membreId: m.id, membreNom: `${m.firstName} ${m.lastName}` })} />
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Discipline *</label>
              <select className={selectClass} value={affForm.discipline} onChange={(e) => setAffForm({ ...affForm, discipline: e.target.value })} disabled={!estAdmin && sportsStaff.filter((d) => d === 'KARATE' || d === 'JUDO').length <= 1}>
                {(estAdmin ? ['KARATE', 'JUDO'] : ['KARATE', 'JUDO'].filter((d) => sportsStaff.includes(d))).map((d) => (
                  <option key={d} value={d}>{d === 'KARATE' ? 'Karaté' : 'Judo'}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Saison *</label>
              <select className={selectClass} value={affForm.saison} onChange={(e) => setAffForm({ ...affForm, saison: e.target.value })}>
                {saisonsChoix().map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <Input label="N° fédération" value={affForm.numero} onChange={(e) => setAffForm({ ...affForm, numero: e.target.value })} placeholder="Optionnel" />
            <Input label="Montant $ (remis à la fédération)" inputMode="decimal" value={affForm.montant} onChange={(e) => setAffForm({ ...affForm, montant: e.target.value })} placeholder="Optionnel" />
            <Input label="Payée le" type="date" value={affForm.datePaiement} onChange={(e) => setAffForm({ ...affForm, datePaiement: e.target.value })} />
          </div>
          <Input label="Note" value={affForm.note} onChange={(e) => setAffForm({ ...affForm, note: e.target.value })} />
          <p className="text-xs text-gray-400">Ce montant va à la fédération : il n'entre pas dans les revenus du club (rapports, tableau de bord).</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalAffiliation(false)}>Annuler</Button>
            <Button onClick={sauverAffiliation} disabled={saving}>{saving ? 'Sauvegarde…' : 'Sauvegarder'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
