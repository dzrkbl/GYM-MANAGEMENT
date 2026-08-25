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
  CalendrierSource: 'Calendrier',
  Lead: 'Prospect',
  Communication: 'Courriel groupé',
  Courriel: 'Courriel',
  Facture: 'Facture',
  Sauvegarde: 'Sauvegarde',
  Inventaire: 'Inventaire',
  Affiliation: 'Affiliation',
};

// Filtres : sans eux, un pointage se noie parmi les paiements et les fiches.
const FILTRES = [
  { valeur: 'TOUS', label: 'Tout' },
  { valeur: 'Pointage', label: 'Pointages' },
  { valeur: 'Member', label: 'Membres' },
  { valeur: 'PaymentVersement', label: 'Paiements' },
  { valeur: 'ERREUR', label: 'Erreurs' },
];

export function Audit() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [filtre, setFiltre] = useState('TOUS');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    apiFetch<AuditEntry[]>('/audit')
      .then((data) => { if (active) setLogs(data); })
      .catch((err) => { if (active) setError(err?.message || 'Erreur'); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  if (user?.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  const visibles = filtre === 'TOUS'
    ? logs
    : filtre === 'ERREUR'
      ? logs.filter((l) => l.action === 'ERREUR')
      : logs.filter((l) => l.entity === filtre);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-cshp-black flex items-center gap-2">
          <History className="text-cshp-red" /> Journal d'audit
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Traçabilité des modifications : membres, paiements, pointages, courriels.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTRES.map((f) => (
          <button
            key={f.valeur}
            onClick={() => setFiltre(f.valeur)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border ${
              filtre === f.valeur ? 'bg-cshp-red text-white border-cshp-red' : 'bg-white text-cshp-gray border-gray-300'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="text-xs text-gray-400 self-center ml-1">
          {visibles.length} entrée(s)
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
                {visibles.length === 0 ? (
                  <tr><td colSpan={5} className="py-6 px-4 text-center text-gray-400 italic">Aucune entrée pour le moment.</td></tr>
                ) : (
                  visibles.map((log) => (
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
        </Card>
      )}
    </div>
  );
}
