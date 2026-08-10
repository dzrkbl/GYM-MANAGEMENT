import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { apiFetch } from '../../lib/api';
import { useSections } from '../../hooks/useSections';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Send, Wrench, CheckCircle2, AlertTriangle } from 'lucide-react';

const selectClass =
  'w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white focus:outline-none focus:ring-2 focus:ring-cshp-red';

interface ResultatEnvoi {
  destinataires: number;
  envoyes: number;
  echecs: number;
  erreur?: string | null;
  echecsDetails?: Array<{ adresse: string; erreur: string }>;
}

interface ConfigCourriel {
  configure: boolean;
  provider: string | null;
  from: string;
  details: string;
}

export function Communications() {
  const { user } = useAuth();
  const { codes, getLabel } = useSections();

  // Sections cochées ; vide = toutes les sections.
  const [sectionsChoisies, setSectionsChoisies] = useState<string[]>([]);
  const [sujet, setSujet] = useState('');
  const [message, setMessage] = useState('');
  const [inclureInactifs, setInclureInactifs] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ResultatEnvoi | null>(null);

  // Diagnostic de la configuration courriel + envoi de test
  const [config, setConfig] = useState<ConfigCourriel | null>(null);
  const [testEnCours, setTestEnCours] = useState(false);
  const [testResultat, setTestResultat] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (user?.role !== 'ADMIN') return;
    apiFetch<ConfigCourriel>('/communications/config')
      .then(setConfig)
      .catch(() => setConfig(null));
  }, [user?.role]);

  if (user?.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  const handleTest = async () => {
    setTestEnCours(true);
    setTestResultat(null);
    try {
      const res = await apiFetch<{ ok: boolean; details: string; to: string }>('/communications/test', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setTestResultat({ ok: true, message: `Courriel de test envoyé à ${res.to} via ${res.details}. Vérifiez votre boîte de réception (et les indésirables).` });
    } catch (err: any) {
      setTestResultat({ ok: false, message: err?.message || 'Échec du test.' });
    } finally {
      setTestEnCours(false);
    }
  };

  const handleSend = async () => {
    if (!sujet.trim() || !message.trim()) { setError('Sujet et message sont requis.'); return; }
    setError('');
    setResult(null);
    setIsLoading(true);
    try {
      const res = await apiFetch<ResultatEnvoi>('/communications', {
        method: 'POST',
        body: JSON.stringify({ sections: sectionsChoisies, sujet, message, inclureInactifs }),
      });
      setResult(res);
      if (res.echecs === 0) {
        setSujet('');
        setMessage('');
      }
    } catch (err: any) {
      setError(err?.message || "Erreur lors de l'envoi");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-cshp-black flex items-center gap-2">
          <Send className="text-cshp-red" /> Communication groupée
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Envoyez un courriel aux membres (le courriel du parent est utilisé en priorité).
        </p>
      </div>

      {/* État de la configuration courriel + test */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-cshp-black">
          <Wrench size={16} className="text-cshp-gray" /> Configuration courriel
        </div>
        {config === null ? (
          <p className="text-sm text-cshp-gray">Vérification…</p>
        ) : config.configure ? (
          <p className="text-sm text-emerald-700 flex items-center gap-1.5">
            <CheckCircle2 size={15} /> {config.details} — expéditeur : {config.from}
          </p>
        ) : (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-3">
            <p className="font-medium flex items-center gap-1.5"><AlertTriangle size={15} /> Aucun envoi possible</p>
            <p className="mt-1">{config.details}</p>
          </div>
        )}
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="secondary" onClick={handleTest} isLoading={testEnCours}>
            Envoyer un courriel de test
          </Button>
          {testResultat && (
            <span className={`text-sm ${testResultat.ok ? 'text-emerald-700' : 'text-red-700'}`}>
              {testResultat.message}
            </span>
          )}
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-cshp-black">Destinataires</label>
          <div className="border border-gray-300 rounded-lg p-3 bg-white space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-cshp-black">
              <input
                type="checkbox"
                checked={sectionsChoisies.length === 0}
                onChange={() => setSectionsChoisies([])}
                className="w-4 h-4 rounded text-cshp-red focus:ring-cshp-red"
              />
              Toutes les sections
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-1">
              {codes.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm text-cshp-black">
                  <input
                    type="checkbox"
                    checked={sectionsChoisies.includes(c)}
                    onChange={(e) => {
                      setSectionsChoisies((prev) =>
                        e.target.checked ? [...prev, c] : prev.filter((x) => x !== c)
                      );
                    }}
                    className="w-4 h-4 rounded text-cshp-red focus:ring-cshp-red"
                  />
                  {getLabel(c)}
                </label>
              ))}
            </div>
            <p className="text-xs text-cshp-gray">
              Cochez un ou plusieurs groupes — ou « Toutes les sections ». Chaque destinataire ne reçoit le courriel qu'une seule fois, même s'il est dans plusieurs groupes.
            </p>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-cshp-black">
          <input
            type="checkbox"
            checked={inclureInactifs}
            onChange={(e) => setInclureInactifs(e.target.checked)}
            className="w-4 h-4 rounded text-cshp-red focus:ring-cshp-red"
          />
          Inclure aussi les membres inactifs
        </label>

        <Input label="Sujet" value={sujet} onChange={(e) => setSujet(e.target.value)} placeholder="Ex. : Fermeture exceptionnelle samedi" />

        <div>
          <label className="block mb-1 text-sm font-medium text-cshp-black">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={8}
            placeholder="Votre message…"
            className="w-full border border-gray-300 rounded-lg p-3 bg-white text-sm"
          />
          <p className="text-xs text-cshp-gray mt-1">Le logo, l'en-tête et la signature du club sont ajoutés automatiquement.</p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}
        {result && result.echecs === 0 && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg p-3">
            ✅ Envoyé à {result.envoyes} destinataire(s) sur {result.destinataires}.
          </div>
        )}
        {result && result.echecs > 0 && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg p-3 space-y-2">
            <p className="font-medium">
              ⚠️ {result.envoyes} envoyé(s), {result.echecs} échec(s) sur {result.destinataires} destinataire(s).
            </p>
            {result.erreur && <p>Erreur : {result.erreur}</p>}
            {result.echecsDetails && result.echecsDetails.length > 0 && (
              <ul className="list-disc pl-5 space-y-0.5">
                {result.echecsDetails.map((e) => (
                  <li key={e.adresse}>{e.adresse}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <Button onClick={handleSend} isLoading={isLoading} className="w-full sm:w-auto">
          Envoyer le courriel
        </Button>
      </Card>
    </div>
  );
}
