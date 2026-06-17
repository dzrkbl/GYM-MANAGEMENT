import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { apiFetch } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';
import { Badge } from '../../components/ui/Badge';
import { UserPlus, ArrowRightCircle, Trash2 } from 'lucide-react';

interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  sport: string;
  requestType: string;
  status: string;
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
          {visibles.map((l) => (
            <Card key={l.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-cshp-black uppercase">{l.lastName}</span>
                  <span className="text-gray-700">{l.firstName}</span>
                  <Badge variant={STATUTS.find((s) => s.value === l.status)?.variant || 'neutral'} className="text-[10px]">
                    {labelStatut(l.status)}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {l.sport} · {l.requestType} · {l.phone || '—'} · {l.email || '—'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select className={selectClass} value={l.status} onChange={(e) => changerStatut(l.id, e.target.value)}>
                  {STATUTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                {l.status !== 'CONVERTED' && (
                  <Button variant="outline" onClick={() => convertir(l.id)} className="!min-h-0 h-9 px-3 text-xs">
                    <ArrowRightCircle size={16} className="mr-1" /> Convertir
                  </Button>
                )}
                <button onClick={() => supprimer(l.id)} className="p-2 text-gray-400 hover:text-red-500" title="Supprimer">
                  <Trash2 size={16} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
