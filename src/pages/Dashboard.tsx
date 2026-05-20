import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiFetch } from '../lib/api';
import { formatMontant } from '../lib/format';
import { Card } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { DollarSign, Users, AlertCircle, CalendarCheck } from 'lucide-react';
import { Navigate } from 'react-router-dom';

export function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const res = await apiFetch<any>('/dashboard/resume');
        setData(res);
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
    </div>
  );
}
