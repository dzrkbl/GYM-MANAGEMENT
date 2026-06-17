import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { apiFetch } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { UploadCloud, CheckCircle, AlertTriangle, SkipForward } from 'lucide-react';

interface StatDetail {
  inserted: number;
  skipped: number;
  errors: number;
  errorDetails: Array<{ ligne: number; nom: string; error: string }>;
}
interface ImportReport {
  membres: StatDetail;
  versements: StatDetail;
}

const COLONNES_MEMBRES =
  'prenom, nom, dateNaissance(AAAA-MM-JJ), genre(M/F), courriel, telephone, nomParent, telephoneParent, courrielParent, statut(ACTIF/INACTIF/EN_ATTENTE), section(ex: KARATE_GR1), plan(MENSUEL/TRIMESTRIEL/ANNUEL), prixBase, rabaisFamille(oui/non), membreFamille, rabaisCustomPct, raisonRabais, montantFinal, dateInscription, finContrat, ceinture, notes';

const COLONNES_VERSEMENTS =
  'nomComplet("Prenom Nom"), numero, montant, datePrevue(AAAA-MM-JJ), datePaiement(vide si non payé), methode(CASH/VIREMENT/CHEQUE/CARTE), note';

function StatLine({ label, stat }: { label: string; stat: StatDetail }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <h4 className="font-bold text-cshp-black mb-2">{label}</h4>
      <div className="flex flex-wrap gap-4 text-sm">
        <span className="inline-flex items-center gap-1 text-emerald-700">
          <CheckCircle size={16} /> {stat.inserted} importé(s)
        </span>
        <span className="inline-flex items-center gap-1 text-gray-500">
          <SkipForward size={16} /> {stat.skipped} ignoré(s)
        </span>
        <span className="inline-flex items-center gap-1 text-red-600">
          <AlertTriangle size={16} /> {stat.errors} erreur(s)
        </span>
      </div>
      {stat.errorDetails.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-red-600 max-h-40 overflow-auto">
          {stat.errorDetails.map((e, i) => (
            <li key={i}>Ligne {e.ligne} — {e.nom} : {e.error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Import() {
  const { user } = useAuth();

  const [membres, setMembres] = useState('');
  const [versements, setVersements] = useState('');
  const [hasHeader, setHasHeader] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState('');

  if (user?.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  const handleImport = async () => {
    if (!membres.trim() && !versements.trim()) {
      setError('Colle au moins les membres ou les versements.');
      return;
    }
    setError('');
    setReport(null);
    setIsLoading(true);
    try {
      const result = await apiFetch<ImportReport>('/import', {
        method: 'POST',
        body: JSON.stringify({ membres, versements, hasHeader }),
      });
      setReport(result);
    } catch (err: any) {
      setError(err?.message || "Erreur lors de l'import");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-cshp-black flex items-center gap-2">
          <UploadCloud className="text-cshp-red" /> Import de données
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Colle tes données depuis Google Sheets / Excel (valeurs séparées par des virgules).
          Les membres déjà présents (même prénom + nom) sont ignorés, pas dupliqués.
        </p>
      </div>

      <Card className="p-5 space-y-4">
        <div>
          <label className="block text-sm font-semibold text-cshp-black mb-1">Membres (CSV)</label>
          <p className="text-xs text-gray-500 mb-2">Colonnes : {COLONNES_MEMBRES}</p>
          <textarea
            value={membres}
            onChange={(e) => setMembres(e.target.value)}
            rows={8}
            placeholder="Massil,Abbout,2018-08-20,M,,514 000-0000,Maman Abbout,,parent@courriel.com,ACTIF,KARATE_GR1,ANNUEL,790,non,,,,790,2025-12-14,2026-12-14,Blanche,"
            className="w-full border border-gray-300 rounded-lg p-3 font-mono text-xs bg-white"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-cshp-black mb-1">Versements (CSV, optionnel)</label>
          <p className="text-xs text-gray-500 mb-2">Colonnes : {COLONNES_VERSEMENTS}</p>
          <textarea
            value={versements}
            onChange={(e) => setVersements(e.target.value)}
            rows={6}
            placeholder="Massil Abbout,1,553,2025-11-13,2025-11-13,VIREMENT,Versement 1/4"
            className="w-full border border-gray-300 rounded-lg p-3 font-mono text-xs bg-white"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-cshp-black">
          <input
            type="checkbox"
            checked={hasHeader}
            onChange={(e) => setHasHeader(e.target.checked)}
            className="w-4 h-4 rounded text-cshp-red focus:ring-cshp-red"
          />
          La première ligne est un en-tête (à ignorer)
        </label>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>
        )}

        <Button onClick={handleImport} isLoading={isLoading} className="w-full sm:w-auto">
          Lancer l'import
        </Button>
      </Card>

      {report && (
        <Card className="p-5 space-y-4">
          <h3 className="font-bold text-cshp-black">Résultat de l'import</h3>
          <StatLine label="Membres" stat={report.membres} />
          <StatLine label="Versements" stat={report.versements} />
        </Card>
      )}
    </div>
  );
}
