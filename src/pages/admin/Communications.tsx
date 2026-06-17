import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { apiFetch } from '../../lib/api';
import { useSections } from '../../hooks/useSections';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Send } from 'lucide-react';

const selectClass =
  'w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white focus:outline-none focus:ring-2 focus:ring-cshp-red';

export function Communications() {
  const { user } = useAuth();
  const { codes, getLabel } = useSections();

  const [section, setSection] = useState('TOUS');
  const [sujet, setSujet] = useState('');
  const [message, setMessage] = useState('');
  const [inclureInactifs, setInclureInactifs] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ destinataires: number; envoyes: number; echecs: number } | null>(null);

  if (user?.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSend = async () => {
    if (!sujet.trim() || !message.trim()) { setError('Sujet et message sont requis.'); return; }
    setError('');
    setResult(null);
    setIsLoading(true);
    try {
      const res = await apiFetch<{ destinataires: number; envoyes: number; echecs: number }>('/communications', {
        method: 'POST',
        body: JSON.stringify({ section, sujet, message, inclureInactifs }),
      });
      setResult(res);
      setSujet('');
      setMessage('');
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

      <Card className="p-5 space-y-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-cshp-black">Destinataires</label>
          <select className={selectClass} value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="TOUS">Toutes les sections</option>
            {codes.map((c) => (
              <option key={c} value={c}>{getLabel(c)}</option>
            ))}
          </select>
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
        {result && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg p-3">
            Envoyé à {result.envoyes} destinataire(s) sur {result.destinataires}.
            {result.echecs > 0 && ` ${result.echecs} échec(s).`}
          </div>
        )}

        <Button onClick={handleSend} isLoading={isLoading} className="w-full sm:w-auto">
          Envoyer le courriel
        </Button>
      </Card>
    </div>
  );
}
