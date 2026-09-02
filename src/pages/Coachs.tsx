import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiFetch } from '../lib/api';
import { formatMontant, formatDateLocal } from '../lib/format';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { CoachForm } from '../components/forms/CoachForm';
import { Plus, UserCircle, Edit3 } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useSections } from '../hooks/useSections';

export function Coachs() {
  const { user } = useAuth();
  const { getLabel } = useSections();
  
  if (user?.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  const [coachs, setCoachs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCoach, setEditingCoach] = useState<any>(null);
  // Mot de passe temporaire renvoyé UNE seule fois par l'API à la création :
  // on l'affiche jusqu'à ce que l'admin ferme le bandeau.
  const [tempCred, setTempCred] = useState<{ email: string; password: string } | null>(null);

  // Réconciliation paie du mois : heures tenues × taux vs forfait historique.
  const moisCourant = new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto' }).format(new Date()).slice(0, 7);
  const [moisReconc, setMoisReconc] = useState(moisCourant);
  const [reconc, setReconc] = useState<any>(null);

  useEffect(() => {
    fetchCoachs();
  }, []);

  useEffect(() => {
    const [a, m] = moisReconc.split('-').map(Number);
    if (!a || !m) return;
    apiFetch<any>(`/coachs/heures?mois=${m}&annee=${a}`).then(setReconc).catch(() => setReconc(null));
  }, [moisReconc]);

  async function fetchCoachs() {
    setIsLoading(true);
    try {
      const data = await apiFetch<any[]>('/coachs');
      setCoachs(data);
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement des coachs');
    } finally {
      setIsLoading(false);
    }
  }

  const openAddModal = () => {
    setEditingCoach(null);
    setIsModalOpen(true);
  };

  const openEditModal = (coach: any) => {
    setEditingCoach(coach);
    setIsModalOpen(true);
  };

  const handleSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      if (editingCoach) {
        await apiFetch(`/coachs/${editingCoach.id}`, {
          method: 'PUT',
          body: JSON.stringify(data)
        });
      } else {
        const created = await apiFetch<any>('/coachs', {
          method: 'POST',
          body: JSON.stringify(data)
        });
        if (created?.tempPassword) {
          setTempCred({ email: created.email, password: created.tempPassword });
        }
      }
      setIsModalOpen(false);
      fetchCoachs();
    } catch (err: any) {
      alert(err.message || 'Erreur');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl md:text-3xl font-bold text-cshp-black">Coachs</h1>
        <Button onClick={openAddModal} className="w-full sm:w-auto">
          <Plus size={20} className="mr-2" /> Ajouter
        </Button>
      </div>

      {tempCred && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg space-y-1">
          <p className="font-semibold text-emerald-800">Compte créé — mot de passe temporaire</p>
          <p className="text-sm text-emerald-800">
            Connexion : <strong>{tempCred.email}</strong> · Mot de passe :{' '}
            <code className="px-1.5 py-0.5 bg-white border border-emerald-200 rounded font-mono">{tempCred.password}</code>
          </p>
          <p className="text-xs text-emerald-700">
            Notez-le et transmettez-le maintenant : il ne sera plus jamais affiché. La personne pourra le changer ensuite.
          </p>
          <Button variant="outline" onClick={() => setTempCred(null)} className="mt-1">
            J'ai noté le mot de passe
          </Button>
        </div>
      )}

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-600 rounded-lg">{error}</div>
      ) : coachs.length === 0 ? (
        <div className="text-center py-12 text-cshp-gray">
          Aucun coach trouvé.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {coachs.map(c => (
            <Card key={c.id} className="p-5 flex flex-col h-full justify-between gap-4">
              <div>
                <div className="flex justify-between items-start">
                  <div className="flex gap-3 items-center">
                    <UserCircle size={40} className="text-gray-300" />
                    <div>
                      <h3 className="text-lg font-bold text-cshp-black">
                        {c.lastName} {c.firstName}
                      </h3>
                      <p className="text-sm text-cshp-gray">
                        {c.section 
                          ? c.section.split(',').map((s: string) => s.trim() === 'U8' ? 'Ninjas' : getLabel(s.trim())).join(', ') 
                          : 'Toutes sections'} · {c.role === 'ADMIN' ? 'Administrateur' : c.role === 'SECTION_MANAGER' ? 'Section Manager' : 'Coach'}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => openEditModal(c)}
                    className="p-1 text-cshp-gray hover:bg-gray-100 rounded transition-colors"
                  >
                    <Edit3 size={18} />
                  </button>
                </div>
                
                <div className="mt-4 text-sm space-y-1">
                  {c.tauxHoraire !== null && c.tauxHoraire !== undefined ? (
                    <p className="flex justify-between" title="Paie à l'heure : séances tenues × durée × taux — prime sur le forfait">
                      <span className="text-cshp-gray">Taux horaire :</span>
                      <span className="font-bold text-cshp-black">{formatMontant(c.tauxHoraire)} /h <span className="text-[10px] font-normal text-emerald-600">à l'heure</span></span>
                    </p>
                  ) : (
                    <p className="flex justify-between">
                      <span className="text-cshp-gray">Rémunération :</span>
                      <span className="font-bold text-cshp-black">{formatMontant(c.remuneration || 0)} /mois</span>
                    </p>
                  )}
                  <p className="flex justify-between">
                    <span className="text-cshp-gray">Courriel :</span>
                    <span className="text-cshp-black truncate w-40 text-right">{c.email}</span>
                  </p>
                </div>
              </div>

              <div className="flex justify-between items-end border-t border-gray-100 pt-3 mt-2">
                {c.actif ? <Badge variant="success">✅ Actif</Badge> : <Badge variant="danger">Inactif</Badge>}
                <span className="text-xs text-cshp-gray">
                  Depuis {formatDateLocal(c.dateDebut)}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Réconciliation mensuelle : on paie sur le relevé d'heures, plus sur
          l'habitude. Les heures viennent des pointages (une séance tenue = une
          date où quelqu'un a été pointé) — rien ne se ressaisit. */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-cshp-gray tracking-wider uppercase">Réconciliation paie du mois</h3>
            <p className="text-xs text-cshp-gray mt-0.5">
              Heures tenues = séances réellement pointées de ses cours × durée. Un coach à taux horaire est payé sur ce relevé ;
              le forfait reste la référence de comparaison.
            </p>
          </div>
          <input
            type="month"
            value={moisReconc}
            onChange={(e) => setMoisReconc(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-cshp-red"
          />
        </div>
        {!reconc ? (
          <p className="text-sm text-cshp-gray italic">Chargement…</p>
        ) : reconc.coachs.length === 0 ? (
          <p className="text-sm text-cshp-gray italic">
            Aucun coach à réconcilier : assignez les coachs à leurs cours (Calendrier) et saisissez leur taux horaire ici.
          </p>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs border-collapse min-w-[760px]">
              <thead>
                <tr className="border-b border-gray-200 text-cshp-gray text-[10px] uppercase tracking-wider font-semibold">
                  <th className="pb-2 pr-2">Coach</th>
                  <th className="pb-2 px-2">Mode</th>
                  <th className="pb-2 px-2 text-right" title="Séances réellement pointées / séances au calendrier du mois">Séances (tenues/prévues)</th>
                  <th className="pb-2 px-2 text-right">Heures (tenues/prévues)</th>
                  <th className="pb-2 px-2 text-right" title={reconc.moisEcoule ? 'Mois écoulé : heures TENUES × taux' : 'Mois en cours : heures PRÉVUES × taux (le réel se lit dans les colonnes tenues)'}>
                    Paie du mois
                  </th>
                  <th className="pb-2 pl-2 text-right" title="Paie du mois − forfait historique">Écart vs forfait</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reconc.coachs.map((c: any) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="py-2.5 pr-2">
                      <div className="font-bold text-cshp-black">{c.nom}</div>
                      {c.cours.length > 0 ? (
                        <div className="text-[10px] text-cshp-gray">
                          {c.cours.map((k: any) => `${k.section} (${k.seancesTenues}/${k.seancesPrevues})`).join(' · ')}
                        </div>
                      ) : (
                        <div className="text-[10px] text-amber-600 font-semibold">
                          ⚠️ aucun cours assigné — assigner ses cours dans le Calendrier
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-2">
                      {c.mode === 'TAUX'
                        ? <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-[10px]">{formatMontant(c.tauxHoraire)}/h</span>
                        : <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-bold text-[10px]">forfait</span>}
                    </td>
                    <td className="py-2.5 px-2 text-right text-cshp-black">{c.seancesTenues} / {c.seancesPrevues}</td>
                    <td className="py-2.5 px-2 text-right text-cshp-black">{c.heuresTenues} h / {c.heuresPrevues} h</td>
                    <td className="py-2.5 px-2 text-right font-bold text-cshp-black">{formatMontant(c.paieRetenue)}</td>
                    <td className={`py-2.5 pl-2 text-right font-bold ${c.ecartVsForfait === null ? 'text-cshp-gray' : c.ecartVsForfait > 0 ? 'text-cshp-red' : 'text-green-600'}`}>
                      {c.ecartVsForfait === null ? '—' : `${c.ecartVsForfait > 0 ? '+' : ''}${formatMontant(c.ecartVsForfait)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-cshp-gray mt-2">
              {reconc.moisEcoule
                ? 'Mois écoulé : la paie retenue = heures TENUES × taux — c\'est elle qui entre dans la masse salariale du Module financier (sauf override du mois).'
                : 'Mois en cours : la paie retenue = heures PRÉVUES au calendrier × taux (charge attendue) ; le réel s\'accumule dans les colonnes « tenues ».'}
            </p>
          </div>
        )}
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => !isSubmitting && setIsModalOpen(false)}
        title={editingCoach ? "Modifier le compte" : "Ajouter un compte"}
        width="lg"
      >
        <CoachForm 
          initialData={editingCoach} 
          onSubmit={handleSubmit} 
          onCancel={() => setIsModalOpen(false)} 
          isLoading={isSubmitting} 
        />
      </Modal>
    </div>
  );
}
