import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
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

export function Prospects() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filtre, setFiltre] = useState('TOUS');
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

  useEffect(() => {
    if (!suivi) { setNotes(null); setNouvelleNote(''); return; }
    let annule = false;
    apiFetch<Note[]>(`/leads/${suivi.id}/notes`)
      .then((r) => { if (!annule) setNotes(r); })
      .catch(() => { if (!annule) setNotes([]); });
    return () => { annule = true; };
  }, [suivi]);

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

  const visibles = filtre === 'TOUS' ? leads : leads.filter((l) => l.status === filtre);

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
        {['TOUS', ...STATUTS.map((s) => s.value)].map((s) => (
          <button
            key={s}
            onClick={() => setFiltre(s)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border ${filtre === s ? 'bg-cshp-red text-white border-cshp-red' : 'bg-white text-cshp-gray border-gray-300'}`}
          >
            {s === 'TOUS' ? 'Tous' : labelStatut(s)}
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
