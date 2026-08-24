import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { formatDateLocal } from '../lib/format';
import { useSections } from '../hooks/useSections';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Phone, MessageSquare, Check, RotateCcw, LifeBuoy } from 'lucide-react';

interface Risque {
  id: string;
  firstName: string;
  lastName: string;
  sections: string[];
  phone: string | null;
  parentName: string | null;
  parentPhone: string | null;
  dernierePresence: string;
  joursDepuis: number;
  seancesManquees: number;
  niveau: 'ALERTE' | 'URGENT' | 'DECROCHE';
  contacteAt: string | null;
}

const NIVEAUX: Record<string, { label: string; carte: string; puce: string }> = {
  ALERTE:   { label: '2 séances manquées', carte: 'border-l-4 border-l-amber-400',  puce: 'bg-amber-100 text-amber-800 border-amber-300' },
  URGENT:   { label: 'À rappeler vite',    carte: 'border-l-4 border-l-cshp-red',   puce: 'bg-red-100 text-red-700 border-red-300' },
  DECROCHE: { label: 'Décroché',           carte: 'border-l-4 border-l-slate-400',  puce: 'bg-slate-200 text-slate-700 border-slate-300' },
};

const FILTRES = [
  { value: 'A_APPELER', label: 'À appeler' },
  { value: 'TOUS', label: 'Tous' },
  { value: 'FAIT', label: 'Déjà appelés' },
];

export function Retention() {
  const navigate = useNavigate();
  const { getLabel } = useSections();
  const [membres, setMembres] = useState<Risque[]>([]);
  const [jamaisPointes, setJamaisPointes] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtre, setFiltre] = useState('A_APPELER');
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = async () => {
    setIsLoading(true);
    try {
      const data = await apiFetch<{ membres: Risque[]; jamaisPointes: number }>('/retention');
      setMembres(data.membres);
      setJamaisPointes(data.jamaisPointes);
      setError('');
    } catch (err: any) {
      setError(err?.message || 'Erreur lors du chargement');
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => { charger(); }, []);

  // Marquage optimiste : le coach enchaîne ses appels sans attendre le réseau.
  const basculerContact = async (m: Risque) => {
    const dejaFait = !!m.contacteAt;
    setEnCours(m.id);
    setMembres((prev) => prev.map((x) => (x.id === m.id ? { ...x, contacteAt: dejaFait ? null : new Date().toISOString() } : x)));
    try {
      await apiFetch(`/retention/${m.id}/contact`, { method: dejaFait ? 'DELETE' : 'POST' });
    } catch {
      charger(); // le serveur fait foi
    } finally {
      setEnCours(null);
    }
  };

  const visibles = useMemo(() => {
    if (filtre === 'TOUS') return membres;
    if (filtre === 'FAIT') return membres.filter((m) => m.contacteAt);
    return membres.filter((m) => !m.contacteAt);
  }, [membres, filtre]);

  const aAppeler = membres.filter((m) => !m.contacteAt).length;
  const recuperables = membres.filter((m) => !m.contacteAt && m.seancesManquees <= 4).length;

  const telephone = (m: Risque) => m.parentPhone || m.phone || null;
  const messageSms = (m: Risque) =>
    encodeURIComponent(`Bonjour, on s'ennuie de ${m.firstName} au dojo ! Tout va bien ?`);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-cshp-black flex items-center gap-2">
          <LifeBuoy size={24} className="text-cshp-red" /> Rétention
        </h1>
        <p className="text-sm text-gray-500 mt-1 max-w-3xl">
          Les athlètes actifs qui ont manqué au moins deux séances depuis leur dernière présence.
          Un enfant cesse de venir plusieurs semaines avant que le parent résilie : c'est
          maintenant que l'appel change quelque chose. Un message court, personnel, qui ne parle
          jamais d'argent.
        </p>
      </div>

      {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg border border-red-100 text-sm">{error}</div>}

      {!isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="p-4">
            <div className="text-3xl font-bold text-cshp-black">{aAppeler}</div>
            <div className="text-xs uppercase font-extrabold text-gray-400 tracking-wider mt-1">À appeler aujourd'hui</div>
          </Card>
          <Card className="p-4">
            <div className="text-3xl font-bold text-emerald-600">{recuperables}</div>
            <div className="text-xs uppercase font-extrabold text-gray-400 tracking-wider mt-1">Encore récupérables (2 à 4 séances)</div>
          </Card>
          <Card className="p-4">
            <div className="text-3xl font-bold text-gray-300">{jamaisPointes}</div>
            <div className="text-xs uppercase font-extrabold text-gray-400 tracking-wider mt-1">Actifs jamais pointés (hors calcul)</div>
          </Card>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTRES.map((f) => (
          <button
            key={f.value}
            onClick={() => setFiltre(f.value)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border ${
              filtre === f.value ? 'bg-cshp-red text-white border-cshp-red' : 'bg-white text-cshp-gray border-gray-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Spinner />
      ) : visibles.length === 0 ? (
        <Card className="text-center py-14 text-gray-500">
          <p className="font-medium text-gray-700">
            {filtre === 'FAIT' ? 'Aucun appel noté pour l\'instant.' : 'Personne ne décroche en ce moment. 👏'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            La liste se remplit dès qu'un athlète manque deux séances tenues.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibles.map((m) => {
            const n = NIVEAUX[m.niveau];
            const tel = telephone(m);
            return (
              <Card key={m.id} className={`p-4 ${n.carte} ${m.contacteAt ? 'opacity-60' : ''}`}>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => navigate(`/membres/${m.id}`)}
                        className="font-bold text-cshp-black uppercase hover:text-cshp-red"
                      >
                        {m.lastName} <span className="font-medium normal-case text-gray-700">{m.firstName}</span>
                      </button>
                      <span className={`px-2 py-0.5 text-[10px] font-bold border rounded-full ${n.puce}`}>
                        {n.label}
                      </span>
                      {m.contacteAt && (
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-full">
                          ✓ Appelé le {formatDateLocal(m.contacteAt)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {m.sections.map(getLabel).join(', ')} · <strong>{m.seancesManquees} séances manquées</strong> ·
                      vu la dernière fois le {formatDateLocal(m.dernierePresence)} (il y a {m.joursDepuis} j)
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {m.parentName ? `${m.parentName} · ` : ''}{tel || 'Aucun téléphone au dossier'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {tel && (
                      <>
                        <a
                          href={`tel:${tel.replace(/[^\d+]/g, '')}`}
                          className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-cshp-black hover:bg-gray-50"
                        >
                          <Phone size={15} /> Appeler
                        </a>
                        <a
                          href={`sms:${tel.replace(/[^\d+]/g, '')}?body=${messageSms(m)}`}
                          className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-cshp-black hover:bg-gray-50"
                          title="SMS avec un message déjà rédigé"
                        >
                          <MessageSquare size={15} /> SMS
                        </a>
                      </>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => basculerContact(m)}
                      disabled={enCours === m.id}
                      className={`!min-h-0 h-9 px-3 text-xs ${
                        m.contacteAt ? '' : '!border-emerald-300 !text-emerald-700 hover:!bg-emerald-50'
                      }`}
                    >
                      {m.contacteAt
                        ? <><RotateCcw size={15} className="mr-1" /> Annuler</>
                        : <><Check size={15} className="mr-1" /> Noté</>}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
