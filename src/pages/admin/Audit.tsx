import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { apiFetch } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { History } from 'lucide-react';

interface AuditEntry {
  id: string;
  userNom: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  description: string | null;
  createdAt: string;
}

const ACTION_STYLE: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  PAY: 'bg-emerald-100 text-emerald-700',
};

const ENTITY_LABEL: Record<string, string> = {
  Member: 'Membre',
  PaymentVersement: 'Paiement',
  Pointage: 'Pointage',
  Retention: 'Rétention',
  Evenement: 'Événement',
  EvenementInscription: 'Inscription événement',
  CalendrierSource: 'Calendrier',
  Lead: 'Prospect',
  LeadNote: 'Note prospect',
  Communication: 'Courriel groupé',
  Courriel: 'Courriel',
  Facture: 'Facture',
  Sauvegarde: 'Sauvegarde',
  Inventaire: 'Inventaire',
  Affiliation: 'Affiliation',
  DepenseAdmin: 'Remboursement',
  User: 'Compte',
  // Système de points (module Gestion du temps) :
  Bareme: 'Barème de points',
  PlanTache: 'Tâche du plan',
  TacheRecurrente: 'Tâche récurrente',
  AcompteAssocie: 'Acompte associée',
};

// Filtres appliqués EN BASE (le journal complet est conservé — la page ne
// charge que des tranches). « Gestion du temps » = les événements du système
// de points : création/modification de tâches, réassignations, barème.
const FILTRES = [
  { valeur: 'TOUS', label: 'Tout' },
  { valeur: 'TEMPS', label: 'Gestion du temps' },
  { valeur: 'COURS', label: 'Cours & heures' },
  { valeur: 'POINTAGE', label: 'Pointages' },
  { valeur: 'MEMBRE', label: 'Membres' },
  { valeur: 'PAIEMENT', label: 'Paiements' },
  { valeur: 'ERREUR', label: 'Erreurs' },
];

const TAILLE_TRANCHE = 200;

export function Audit() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [filtre, setFiltre] = useState('TOUS');
  const [isLoading, setIsLoading] = useState(true);
  const [chargePlus, setChargePlus] = useState(false);
  const [error, setError] = useState('');

  // Changement de filtre = nouvelle requête serveur (repart du plus récent).
  useEffect(() => {
    let active = true;
    setIsLoading(true);
    apiFetch<{ entrees: AuditEntry[]; total: number }>(`/audit?categorie=${filtre}&limit=${TAILLE_TRANCHE}`)
      .then((data) => {
        if (!active) return;
        setLogs(data.entrees);
        setTotal(data.total);
        setError('');
      })
      .catch((err) => { if (active) setError(err?.message || 'Erreur'); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [filtre]);

  const chargerPlusAncien = async () => {
    if (logs.length === 0) return;
    setChargePlus(true);
    try {
      const curseur = encodeURIComponent(logs[logs.length - 1].createdAt);
      const data = await apiFetch<{ entrees: AuditEntry[]; total: number }>(
        `/audit?categorie=${filtre}&limit=${TAILLE_TRANCHE}&avant=${curseur}`
      );
      setLogs((prev) => [...prev, ...data.entrees]);
      setTotal(data.total);
    } catch (err: any) {
      setError(err?.message || 'Erreur');
    } finally {
      setChargePlus(false);
    }
  };

  if (user?.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-cshp-black flex items-center gap-2">
          <History className="text-cshp-red" /> Journal d'audit
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Traçabilité des modifications : membres, paiements, pointages, courriels, gestion du temps.
          Le journal complet est conservé en base — la page charge par tranches de {TAILLE_TRANCHE}.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {FILTRES.map((f) => (
          <button
            key={f.valeur}
            onClick={() => setFiltre(f.valeur)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border min-h-[36px] ${
              filtre === f.valeur ? 'bg-cshp-red text-white border-cshp-red' : 'bg-white text-cshp-gray border-gray-300'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="text-xs text-gray-400 self-center ml-1">
          {logs.length} affichée(s) sur {total} au total
        </span>
      </div>

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-100">{error}</div>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase text-gray-500">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Utilisateur</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Élément</th>
                  <th className="py-3 px-4">Détail</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 px-4 text-center text-gray-400 italic">
                      {filtre === 'TEMPS'
                        ? 'Aucune entrée pour le moment — cette section se remplira dès la mise en service du module de gestion du temps (tâches, plan mensuel, barème de points).'
                        : 'Aucune entrée pour ce filtre.'}
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="border-t border-gray-100">
                      <td className="py-2.5 px-4 text-gray-500 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('fr-CA')}
                      </td>
                      <td className="py-2.5 px-4 text-gray-800">{log.userNom || '—'}</td>
                      <td className="py-2.5 px-4">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${ACTION_STYLE[log.action] || 'bg-gray-100 text-gray-700'}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-gray-700">{ENTITY_LABEL[log.entity] || log.entity}</td>
                      <td className="py-2.5 px-4 text-gray-600">{log.description || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {logs.length < total && (
            <div className="p-3 border-t border-gray-100 text-center">
              <button
                onClick={chargerPlusAncien}
                disabled={chargePlus}
                className="px-4 py-2 min-h-[40px] rounded-lg border border-gray-300 text-sm font-semibold text-cshp-gray hover:bg-gray-50 disabled:opacity-50"
              >
                {chargePlus ? 'Chargement…' : `Charger ${TAILLE_TRANCHE} entrées plus anciennes`}
              </button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
