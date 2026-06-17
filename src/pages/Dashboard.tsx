import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiFetch } from '../lib/api';
import { formatMontant } from '../lib/format';
import { Card } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { DollarSign, Users, AlertCircle, CalendarCheck, TrendingUp, Percent, Repeat } from 'lucide-react';
import { Navigate } from 'react-router-dom';

export function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [kpis, setKpis] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const [res, kpisRes] = await Promise.all([
          apiFetch<any>('/dashboard/resume'),
          apiFetch<any>('/dashboard/kpis'),
        ]);
        setData(res);
        setKpis(kpisRes);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }
    
    if (user?.role === 'ADMIN') {
      fetchDashboard();
    }
  }, [user]);

  if (user?.role !== 'ADMIN') {
    return <Navigate to="/membres" replace />;
  }

  if (isLoading) return <Spinner />;
  
  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-100">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold text-cshp-black">Tableau de bord</h1>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Revenus */}
        <Card className="p-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-cshp-gray mb-1">Revenus (Ce mois)</p>
              <h3 className="text-2xl font-bold text-cshp-black truncate max-w-[150px]">
                {formatMontant(data.revenus.moisActuel)}
              </h3>
            </div>
            <div className="p-3 bg-green-50 text-green-600 rounded-lg shrink-0">
              <DollarSign size={24} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className={data.revenus.variation >= 0 ? "text-green-600 font-medium" : "text-red-500 font-medium"}>
              {data.revenus.variation >= 0 ? '+' : ''}{formatMontant(data.revenus.variation)}
            </span>
            <span className="text-cshp-gray ml-2 truncate">vs mois dernier</span>
          </div>
        </Card>

        {/* Membres */}
        <Card className="p-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-cshp-gray mb-1">Membres actifs</p>
              <h3 className="text-2xl font-bold text-cshp-black">
                {data.membres.total}
              </h3>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-lg shrink-0">
              <Users size={24} />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
            {Object.entries(data.membres.parSection).map(([section, count]: any) => (
              <span key={section} className="px-2 py-1 bg-gray-100 rounded-md text-cshp-black">
                {section}: {count}
              </span>
            ))}
          </div>
        </Card>

        {/* Retards */}
        <Card className="p-6 border-l-4 border-l-cshp-red">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-cshp-gray mb-1">Retards</p>
              <h3 className="text-2xl font-bold text-cshp-black">
                {data.retards.count} <span className="text-sm font-normal text-cshp-gray">pers.</span>
              </h3>
            </div>
            <div className="p-3 bg-red-50 text-cshp-red rounded-lg shrink-0">
              <AlertCircle size={24} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-cshp-red font-medium">
              {formatMontant(data.retards.montantTotal)}
            </span>
            <span className="text-cshp-gray ml-2">à récupérer</span>
          </div>
        </Card>

        {/* Présences */}
        <Card className="p-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-cshp-gray mb-1">Présences</p>
              <h3 className="text-2xl font-bold text-cshp-black">
                {data.presences.tauxCetteSemaine}%
              </h3>
            </div>
            <div className="p-3 bg-purple-50 text-purple-600 rounded-lg shrink-0">
              <CalendarCheck size={24} />
            </div>
          </div>
          <div className="mt-4 text-sm text-cshp-gray">
            La semaine dernière
          </div>
        </Card>

        {/* Masse Salariale */}
        <Card className="p-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-cshp-gray mb-1">Masse salariale</p>
              <h3 className="text-2xl font-bold text-cshp-black truncate max-w-[150px]">
                {formatMontant(data.masseSalariale || 0)}
              </h3>
            </div>
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
              <DollarSign size={24} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-cshp-gray">
              {data.revenus.moisActuel > 0
                ? ((data.masseSalariale / data.revenus.moisActuel) * 100).toFixed(1)
                : 0} % des revenus
            </span>
          </div>
        </Card>
      </div>

      {kpis && (
        <>
          <h2 className="text-lg font-bold text-cshp-black pt-2">Indicateurs de pilotage</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* MRR */}
            <Card className="p-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-cshp-gray mb-1">Revenu récurrent mensuel</p>
                  <h3 className="text-2xl font-bold text-cshp-black truncate max-w-[180px]">{formatMontant(kpis.mrr)}</h3>
                </div>
                <div className="p-3 bg-green-50 text-green-600 rounded-lg shrink-0"><TrendingUp size={24} /></div>
              </div>
              <p className="mt-4 text-sm text-cshp-gray">Équivalent mensuel des cotisations actives</p>
            </Card>

            {/* Recouvrement */}
            <Card className="p-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-cshp-gray mb-1">Taux de recouvrement</p>
                  <h3 className="text-2xl font-bold text-cshp-black">{kpis.recouvrement.pct}%</h3>
                </div>
                <div className="p-3 bg-blue-50 text-blue-600 rounded-lg shrink-0"><Percent size={24} /></div>
              </div>
              <p className="mt-4 text-sm text-cshp-gray">
                {formatMontant(kpis.recouvrement.encaisse)} / {formatMontant(kpis.recouvrement.total)} échus
              </p>
            </Card>

            {/* Rétention */}
            <Card className="p-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-cshp-gray mb-1">Taux de rétention</p>
                  <h3 className="text-2xl font-bold text-cshp-black">{kpis.retention.pct}%</h3>
                </div>
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg shrink-0"><Repeat size={24} /></div>
              </div>
              <p className="mt-4 text-sm text-cshp-gray">
                {kpis.retention.actifs} actifs · {kpis.retention.inactifs} inactifs
              </p>
            </Card>
          </div>

          {/* Prévision de trésorerie */}
          <Card className="p-6">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-widest border-b pb-2 mb-4">
              Prévision de trésorerie (3 mois)
            </h3>
            <div className="space-y-4">
              {kpis.previsions.map((p: any) => {
                const pct = p.total > 0 ? Math.round((p.encaisse / p.total) * 100) : 0;
                return (
                  <div key={p.label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-cshp-black capitalize">{p.label}</span>
                      <span className="text-cshp-gray">
                        {formatMontant(p.total)}
                        <span className="text-xs text-cshp-red ml-2">à venir {formatMontant(p.aVenir)}</span>
                      </span>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-cshp-gray">La portion verte représente les versements déjà encaissés.</p>
          </Card>
        </>
      )}
    </div>
  );
}
