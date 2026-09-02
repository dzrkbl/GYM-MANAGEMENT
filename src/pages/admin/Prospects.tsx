import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { apiFetch } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';
import { Badge } from '../../components/ui/Badge';
import { UserPlus, ArrowRightCircle, Trash2, MessageSquare } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';

interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  sport: string;
  requestType: string;
  status: string;
  source: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  note: string | null;
  createdAt: string;
  ficheRecueAt: string | null; // fiche d'inscription en ligne reçue
  membreId: string | null;     // dossier membre créé par la fiche ou la conversion
  prochaineEtape: string | null;     // « RDV essai jeudi 17 h », « Rappeler »…
  prochaineEcheance: string | null;  // date-jour de l'étape (alerte à l'approche)
  nbNotes: number;
  derniereNote: { texte: string; auteurNom: string | null; createdAt: string } | null;
}

interface Note {
  id: string;
  texte: string;
  auteurNom: string | null;
  createdAt: string;
}

const STATUTS: { value: string; label: string; variant: any }[] = [
  { value: 'NEW', label: 'Nouveau', variant: 'warning' },
  { value: 'CONTACTED', label: 'Contacté', variant: 'neutral' },
  { value: 'CONVERTED', label: 'Converti', variant: 'success' },
  { value: 'LOST', label: 'Perdu', variant: 'danger' },
];
const labelStatut = (s: string) => STATUTS.find((x) => x.value === s)?.label || s;
const selectClass = 'min-h-[36px] border border-gray-300 rounded-lg px-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-cshp-red';

// Jour civil de Montréal (jamais l'heure UTC du navigateur).
const aujourdhuiMontreal = () =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto' }).format(new Date());

// Une relance est due quand son échéance est atteinte et que le prospect est
// encore en jeu (ni converti, ni perdu).
const relanceDue = (l: Lead) =>
  !!l.prochaineEcheance &&
  (l.status === 'NEW' || l.status === 'CONTACTED') &&
  l.prochaineEcheance.slice(0, 10) <= aujourdhuiMontreal();

// L'alerte de la carte : rouge quand c'est le jour ou passé, ambre à 2 jours.
function badgeEcheance(l: Lead): { texte: string; classe: string } | null {
  if (!l.prochaineEcheance) return null;
  const jour = l.prochaineEcheance.slice(0, 10);
  const auj = aujourdhuiMontreal();
  const joursDiff = Math.round((new Date(jour + 'T12:00:00Z').getTime() - new Date(auj + 'T12:00:00Z').getTime()) / 86_400_000);
  const date = new Date(jour + 'T12:00:00Z').toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  if (joursDiff < 0) return { texte: `⏰ en retard de ${-joursDiff} j — ${date}`, classe: 'bg-red-50 text-red-600 border-red-200' };
  if (joursDiff === 0) return { texte: `⏰ aujourd'hui`, classe: 'bg-red-50 text-red-600 border-red-200' };
  if (joursDiff <= 2) return { texte: `🔔 ${joursDiff === 1 ? 'demain' : 'dans 2 jours'} — ${date}`, classe: 'bg-amber-50 text-amber-700 border-amber-300' };
  return { texte: `📅 ${date}`, classe: 'bg-gray-50 text-gray-600 border-gray-200' };
}

// L'ordre des onglets : le travail du jour d'abord (Nouveau est la page
// d'accueil, À relancer juste après), « Tous » relégué à la fin.
const ONGLETS = ['NEW', 'RELANCE', 'CONTACTED', 'CONVERTED', 'LOST', 'TOUS'] as const;

export function Prospects() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [leads, setLeads] = useState<Lead[]>([]);
  // ?vue=RELANCE : la carte « Prospects à contacter » du tableau de bord
  // atterrit directement sur le bon onglet.
  const vueInitiale = searchParams.get('vue');
  const [filtre, setFiltre] = useState(
    vueInitiale && (ONGLETS as readonly string[]).includes(vueInitiale) ? vueInitiale : 'NEW'
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', sport: 'KARATE', requestType: 'ESSAI' });
  const [saving, setSaving] = useState(false);

  // Fil de suivi : ouvert dans une modale, pour ne pas alourdir la carte.
  const [suivi, setSuivi] = useState<Lead | null>(null);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [nouvelleNote, setNouvelleNote] = useState('');
  const [envoiNote, setEnvoiNote] = useState(false);

  // Prochaine étape (dans la modale de suivi) : texte + échéance.
  const [etapeTexte, setEtapeTexte] = useState('');
  const [etapeDate, setEtapeDate] = useState('');
  const [envoiEtape, setEnvoiEtape] = useState(false);

  useEffect(() => {
    if (!suivi) { setNotes(null); setNouvelleNote(''); return; }
    setEtapeTexte(suivi.prochaineEtape || '');
    setEtapeDate(suivi.prochaineEcheance ? suivi.prochaineEcheance.slice(0, 10) : '');
    let annule = false;
    apiFetch<Note[]>(`/leads/${suivi.id}/notes`)
      .then((r) => { if (!annule) setNotes(r); })
      .catch(() => { if (!annule) setNotes([]); });
    return () => { annule = true; };
  }, [suivi]);

  // Enregistre (ou efface) la prochaine étape du prospect ouvert.
  const sauverEtape = async (effacer = false) => {
    if (!suivi) return;
    const texte = effacer ? null : (etapeTexte.trim() || null);
    const date = effacer ? null : (etapeDate || null);
    if (!effacer && !texte && !date) return;
    setEnvoiEtape(true);
    try {
      const maj = await apiFetch<Lead>(`/leads/${suivi.id}`, {
        method: 'PUT',
        body: JSON.stringify({ prochaineEtape: texte, prochaineEcheance: date }),
      });
      setLeads((p) => p.map((l) => (l.id === suivi.id ? { ...l, prochaineEtape: maj.prochaineEtape, prochaineEcheance: maj.prochaineEcheance } : l)));
      setSuivi((s) => (s ? { ...s, prochaineEtape: maj.prochaineEtape, prochaineEcheance: maj.prochaineEcheance } : s));
      if (effacer) { setEtapeTexte(''); setEtapeDate(''); }
    } catch (err: any) {
      setError(err?.message || "Erreur lors de l'enregistrement de la prochaine étape");
    } finally { setEnvoiEtape(false); }
  };

  const ajouterNote = async () => {
    const texte = nouvelleNote.trim();
    if (!texte || !suivi) return;
    setEnvoiNote(true);
    try {
      const note = await apiFetch<Note>(`/leads/${suivi.id}/notes`, { method: 'POST', body: JSON.stringify({ texte }) });
      setNotes((p) => [note, ...(p || [])]);
      setNouvelleNote('');
      // Le compteur de la carte suit sans recharger toute la liste.
      setLeads((p) => p.map((l) => (l.id === suivi.id ? { ...l, nbNotes: (l.nbNotes || 0) + 1 } : l)));
    } catch (err: any) {
      setError(err?.message || "Erreur lors de l'ajout de la note");
    } finally { setEnvoiNote(false); }
  };

  const supprimerNote = async (id: string) => {
    if (!confirm('Supprimer cette note du fil de suivi ?')) return;
    try {
      await apiFetch(`/leads/notes/${id}`, { method: 'DELETE' });
      setNotes((p) => (p || []).filter((n) => n.id !== id));
      setLeads((p) => p.map((l) => (l.id === suivi?.id ? { ...l, nbNotes: Math.max(0, (l.nbNotes || 1) - 1) } : l)));
    } catch (err: any) { setError(err?.message || 'Suppression impossible'); }
  };

  const load = async () => {
    setIsLoading(true);
    try {
      const data = await apiFetch<Lead[]>('/leads');
      setLeads(data);
    } catch (err: any) {
      setError(err?.message || 'Erreur');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { if (user?.role === 'ADMIN') load(); }, [user]);

  if (user?.role !== 'ADMIN') return <Navigate to="/dashboard" replace />;

  const ajouter = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) { setError('Prénom et nom requis.'); return; }
    setSaving(true);
    try {
      await apiFetch('/leads', { method: 'POST', body: JSON.stringify(form) });
      setForm({ firstName: '', lastName: '', phone: '', email: '', sport: 'KARATE', requestType: 'ESSAI' });
      setShowForm(false);
      await load();
    } catch (err: any) {
      setError(err?.message || "Erreur lors de l'ajout");
    } finally {
      setSaving(false);
    }
  };

  const changerStatut = async (id: string, status: string) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    try { await apiFetch(`/leads/${id}`, { method: 'PUT', body: JSON.stringify({ status }) }); }
    catch { load(); }
  };

  const convertir = async (id: string) => {
    if (!confirm('Convertir ce prospect en membre (statut EN ATTENTE) ?')) return;
    try {
      const res = await apiFetch<{ membreId: string }>(`/leads/${id}/convert`, { method: 'POST' });
      navigate(`/membres/${res.membreId}`);
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la conversion');
    }
  };

  const supprimer = async (id: string) => {
    if (!confirm('Supprimer ce prospect ?')) return;
    try { await apiFetch(`/leads/${id}`, { method: 'DELETE' }); await load(); }
    catch (err: any) { setError(err?.message || 'Erreur'); }
  };

  const relances = leads.filter(relanceDue);
  const visibles =
    filtre === 'TOUS' ? leads
    : filtre === 'RELANCE'
      ? [...relances].sort((a, b) => (a.prochaineEcheance || '').localeCompare(b.prochaineEcheance || ''))
      : leads.filter((l) => l.status === filtre);

  const labelOnglet = (s: string) => {
    if (s === 'TOUS') return 'Tous';
    if (s === 'RELANCE') return `À relancer${relances.length > 0 ? ` · ${relances.length}` : ''}`;
    if (s === 'NEW') {
      const n = leads.filter((l) => l.status === 'NEW').length;
      return `Nouveau${n > 0 ? ` · ${n}` : ''}`;
    }
    return labelStatut(s);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-cshp-black">Prospects / essais</h1>
          <p className="text-sm text-gray-500 mt-1">Suivez les demandes d'essai et convertissez-les en membres.</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)} className="!min-h-0 h-10">
          <UserPlus size={18} className="mr-1" /> Nouveau prospect
        </Button>
      </div>

      {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg border border-red-100 text-sm">{error}</div>}

      {showForm && (
        <Card className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Prénom *" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            <Input label="Nom *" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            <Input label="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input label="Courriel" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <div>
              <label className="block mb-1 text-sm font-medium text-cshp-black">Discipline d'intérêt</label>
              <select className={selectClass + ' w-full min-h-[44px]'} value={form.sport} onChange={(e) => setForm({ ...form, sport: e.target.value })}>
                <option value="KARATE">Karaté</option>
                <option value="JUDO">Judo</option>
                <option value="NINJAS">Ninjas</option>
                <option value="TAEKWONDO">Taekwondo</option>
                <option value="AUTRE">Autre</option>
              </select>
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium text-cshp-black">Type de demande</label>
              <select className={selectClass + ' w-full min-h-[44px]'} value={form.requestType} onChange={(e) => setForm({ ...form, requestType: e.target.value })}>
                <option value="ESSAI">Cours d'essai</option>
                <option value="RAPPEL">Demande de rappel</option>
                <option value="TARIFS">Information tarifs</option>
                <option value="AUTRE">Autre</option>
              </select>
            </div>
          </div>
          <Button onClick={ajouter} isLoading={saving}>Ajouter le prospect</Button>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {ONGLETS.map((s) => (
          <button
            key={s}
            onClick={() => setFiltre(s)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border ${
              filtre === s
                ? 'bg-cshp-red text-white border-cshp-red'
                : s === 'RELANCE' && relances.length > 0
                  ? 'bg-red-50 text-red-600 border-red-300'
                  : 'bg-white text-cshp-gray border-gray-300'
            }`}
          >
            {labelOnglet(s)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Spinner />
      ) : visibles.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Aucun prospect.</p>
      ) : (
        <div className="space-y-3">
          {visibles.map((l) => {
            // Ancienneté du prospect : un NEW qui traîne se voit tout de suite.
            const joursDepuis = Math.floor((Date.now() - new Date(l.createdAt).getTime()) / 86_400_000);
            const sansSuivi = l.status === 'NEW' && joursDepuis >= 3;
            // Fiche d'inscription en ligne reçue : carte verte, impossible à rater.
            const ficheRecue = !!l.ficheRecueAt;
            return (
            <Card key={l.id} className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              ficheRecue ? 'border-l-4 border-l-emerald-500 bg-emerald-50/60' : sansSuivi ? 'border-l-4 border-l-cshp-red' : ''
            }`}>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-cshp-black uppercase">{l.lastName}</span>
                  <span className="text-gray-700">{l.firstName}</span>
                  <Badge variant={STATUTS.find((s) => s.value === l.status)?.variant || 'neutral'} className="text-[10px]">
                    {labelStatut(l.status)}
                  </Badge>
                  {ficheRecue && (
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-full">
                      📋 Fiche reçue le {new Date(l.ficheRecueAt!).toLocaleDateString('fr-CA')}
                    </span>
                  )}
                  {sansSuivi && (
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-red-50 text-red-600 border border-red-200 rounded-full">
                      ⏳ {joursDepuis} j sans suivi
                    </span>
                  )}
                </div>
                {(l.prochaineEtape || l.prochaineEcheance) && (() => {
                  const b = badgeEcheance(l);
                  return (
                    <button
                      onClick={() => setSuivi(l)}
                      className={`mt-1.5 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-semibold ${b?.classe || 'bg-gray-50 text-gray-600 border-gray-200'}`}
                      title="Prochaine étape — cliquer pour modifier"
                    >
                      📌 {l.prochaineEtape || 'Relance'}{b ? ` · ${b.texte}` : ''}
                    </button>
                  );
                })()}
                <p className="text-xs text-gray-500 mt-1">
                  {l.sport} · {l.requestType} · {l.phone || '—'} · {l.email || '—'} ·
                  demande du {new Date(l.createdAt).toLocaleDateString('fr-CA')}
                </p>
                {(l.source || l.utmContent) && (
                  <p className="text-xs text-cshp-red mt-0.5">
                    {[l.source, l.utmCampaign, l.utmContent].filter(Boolean).join(' · ')}
                  </p>
                )}
                {l.note && <p className="text-xs text-gray-400 mt-0.5 italic">{l.note}</p>}
              </div>
              <div className="flex items-center gap-2">
                <select className={selectClass} value={l.status} onChange={(e) => changerStatut(l.id, e.target.value)}>
                  {STATUTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                {l.email && l.status !== 'CONVERTED' && (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        await apiFetch('/inscription/inviter', {
                          method: 'POST',
                          body: JSON.stringify({ courriel: l.email, prenom: l.firstName, leadId: l.id }),
                        });
                        alert(`Lien d'inscription envoyé à ${l.email} ✅`);
                        load();
                      } catch (err: any) {
                        alert(err?.message || "Échec de l'envoi");
                      }
                    }}
                    className="!min-h-0 h-9 px-3 text-xs"
                    title="Envoyer le lien de la fiche d'inscription en ligne"
                  >
                    ✉️ Lien d'inscription
                  </Button>
                )}
                {l.status !== 'CONVERTED' && (
                  <Button variant="outline" onClick={() => convertir(l.id)} className="!min-h-0 h-9 px-3 text-xs">
                    <ArrowRightCircle size={16} className="mr-1" /> Convertir
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => setSuivi(l)}
                  className={`!min-h-0 h-9 px-3 text-xs ${l.nbNotes > 0 ? '!border-slate-400 !text-slate-800' : ''}`}
                  title="Fil de suivi : qui a appelé, ce qui s'est dit"
                >
                  <MessageSquare size={15} className="mr-1" />
                  Note{l.nbNotes > 0 ? ` · ${l.nbNotes}` : ''}
                </Button>
                {l.membreId && (
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/membres/${l.membreId}`)}
                    className="!min-h-0 h-9 px-3 text-xs !border-emerald-300 !text-emerald-700 hover:!bg-emerald-50"
                    title="Ouvrir le dossier membre créé pour ce prospect"
                  >
                    👤 Voir la fiche membre
                  </Button>
                )}
                <button onClick={() => supprimer(l.id)} className="p-2 text-gray-400 hover:text-red-500" title="Supprimer">
                  <Trash2 size={16} />
                </button>
              </div>
            </Card>
            );
          })}
        </div>
      )}

      {/* Fil de suivi. Volontairement hors de la carte : la liste reste dense,
          et l'historique complet vit ici. */}
      <Modal
        isOpen={!!suivi}
        onClose={() => setSuivi(null)}
        title={suivi ? `Suivi — ${suivi.firstName} ${suivi.lastName}` : ''}
        width="lg"
      >
        {suivi && (
          <div className="space-y-4">
            {/* La prochaine action à poser : QUOI et POUR QUAND. L'alerte de la
                carte et l'onglet « À relancer » se nourrissent d'ici. */}
            <div className="p-3 rounded-lg border border-gray-200 bg-white space-y-2">
              <p className="text-xs font-bold text-cshp-gray uppercase tracking-wider">📌 Prochaine étape</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={etapeTexte}
                  onChange={(e) => setEtapeTexte(e.target.value)}
                  placeholder="RDV essai jeudi 17 h · Rappeler après relâche…"
                  maxLength={200}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cshp-red"
                />
                <input
                  type="date"
                  value={etapeDate}
                  onChange={(e) => setEtapeDate(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cshp-red"
                  title="Échéance : la carte s'allume à l'approche, et le prospect entre dans « À relancer » le jour venu"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-gray-400">
                  L'heure d'un rendez-vous s'écrit dans le texte ; la date sert d'alerte.
                </span>
                <div className="flex gap-2">
                  {(suivi.prochaineEtape || suivi.prochaineEcheance) && (
                    <Button
                      variant="outline"
                      onClick={() => sauverEtape(true)}
                      disabled={envoiEtape}
                      className="!min-h-0 h-9 px-3 text-xs whitespace-nowrap"
                      title="Étape faite : efface le texte et l'échéance"
                    >
                      Fait ✓
                    </Button>
                  )}
                  <Button onClick={() => sauverEtape(false)} disabled={envoiEtape || (!etapeTexte.trim() && !etapeDate)} className="!min-h-0 h-9 px-4 text-xs">
                    {envoiEtape ? '…' : 'Enregistrer'}
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <textarea
                value={nouvelleNote}
                onChange={(e) => setNouvelleNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ajouterNote(); }}
                rows={3}
                placeholder="Appelé, pas de réponse. Rappeler jeudi soir…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cshp-red"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-gray-400">
                  Signé de votre nom et horodaté. Ctrl+Entrée pour enregistrer.
                </span>
                <Button onClick={ajouterNote} disabled={envoiNote || !nouvelleNote.trim()} className="!min-h-0 h-9 px-4 text-xs">
                  {envoiNote ? 'Ajout…' : 'Ajouter'}
                </Button>
              </div>
            </div>

            {notes === null ? (
              <div className="py-6 flex justify-center"><Spinner /></div>
            ) : notes.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-4 text-center">
                Aucune note. La première trace de suivi commence ici.
              </p>
            ) : (
              <ul className="space-y-2 max-h-[45vh] overflow-y-auto">
                {notes.map((n) => (
                  <li key={n.id} className="group p-3 rounded-lg border border-gray-100 bg-gray-50/60">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-cshp-black whitespace-pre-line flex-1">{n.texte}</p>
                      <button
                        onClick={() => supprimerNote(n.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity shrink-0"
                        title="Supprimer cette note"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {n.auteurNom || 'Auteur inconnu'} · {new Date(n.createdAt).toLocaleString('fr-CA')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
