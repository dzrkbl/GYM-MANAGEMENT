import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiFetch } from '../lib/api';
import { formatMontant, formatDateLocal } from '../lib/format';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Navigate } from 'react-router-dom';
import { FileText, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useSections } from '../hooks/useSections';
import { SectionPieChart } from '../components/rapports/SectionPieChart';

const SectionCard = ({ s }: { s: any }) => (
  <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-3">
    <div className="flex justify-between items-start">
      <span className="font-bold text-cshp-black">{s.label || s.section}</span>
      <div className="text-right">
        <span className="font-bold text-cshp-black">{formatMontant(s.montantTotal)}</span>
        <span className="text-xs text-cshp-gray ml-2">· {s.nbMembres} mbr</span>
      </div>
    </div>

    {/* Part globale */}
    <div>
      <div className="flex justify-between text-xs text-cshp-gray mb-1">
        <span>Part des revenus</span>
        <span className="font-bold text-cshp-black">{s.pourcentage.toFixed(0)}%</span>
      </div>
      <div className="w-full bg-gray-200 h-1.5 rounded-full">
        <div className="bg-cshp-red h-full rounded-full" style={{ width: `${s.pourcentage}%` }} />
      </div>
    </div>

    {/* Jauge tricolore */}
    {s.montantTotal > 0 && (
      <div>
        <div className="flex h-3 rounded-full overflow-hidden w-full">
          <div className="bg-green-500"  style={{ width: `${(s.encaisse  / s.montantTotal) * 100}%` }} />
          <div className="bg-yellow-400" style={{ width: `${(s.enAttente / s.montantTotal) * 100}%` }} />
          <div className="bg-red-500"    style={{ width: `${(s.enRetard  / s.montantTotal) * 100}%` }} />
        </div>
        <div className="flex justify-between text-xs mt-1">
          <span className="text-green-600  font-semibold">🟢 {((s.encaisse  / s.montantTotal)*100).toFixed(0)}% · {formatMontant(s.encaisse)}</span>
          <span className="text-yellow-600 font-semibold">🟡 {((s.enAttente / s.montantTotal)*100).toFixed(0)}% · {formatMontant(s.enAttente)}</span>
          <span className="text-red-600    font-semibold">🔴 {((s.enRetard  / s.montantTotal)*100).toFixed(0)}% · {formatMontant(s.enRetard)}</span>
        </div>
      </div>
    )}
  </div>
);

export function Rapports() {
  const { user } = useAuth();
  const { getLabel } = useSections();
  
  if (user?.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  const currentMonthValue = new Date().toISOString().substring(0, 7); // YYYY-MM
  const [periodType, setPeriodType] = useState('MOIS'); // MOIS, TRIMESTRE, ANNEE, CUSTOM
  const [month, setMonth] = useState(currentMonthValue);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Saisie et suivi manuel de la masse salariale
  const [masseSalarialeList, setMasseSalarialeList] = useState<any[]>([]);
  const [editingKeys, setEditingKeys] = useState<Record<string, { montant: string; note: string }>>({});

  // Saisie et suivi manuel des salaires fixes des coachs (Masse Salariale A+B)
  const [coachs, setCoachs] = useState<{ id: string; nom: string; montant: number }[]>([]);
  const [showCoachConfig, setShowCoachConfig] = useState(false);
  const [editingCoach, setEditingCoach] = useState<Record<string, string>>({});
  const [newCoach, setNewCoach] = useState({ nom: '', montant: '' });

  useEffect(() => {
    apiFetch<any[]>('/coach-salaire')
      .then(setCoachs)
      .catch(console.error);
  }, []);

  const totalDefaut = useMemo(() => {
    return coachs.reduce((s, c) => s + c.montant, 0);
  }, [coachs]);

  useEffect(() => {
    fetchReport();
  }, [periodType, month, customFrom, customTo]);

  // Compute dates based on selection
  const dateRange = useMemo(() => {
    let from = '';
    let to = '';
    const now = new Date();
    
    if (periodType === 'MOIS') {
      const [y, m] = month.split('-');
      from = `${month}-01`;
      to = new Date(parseInt(y), parseInt(m), 0).toISOString().split('T')[0];
    } else if (periodType === 'TRIMESTRE') {
      const m = now.getMonth();
      const qStartMonth = m - (m % 3);
      from = new Date(now.getFullYear(), qStartMonth, 1).toISOString().split('T')[0];
      to = new Date(now.getFullYear(), qStartMonth + 3, 0).toISOString().split('T')[0];
    } else if (periodType === 'ANNEE') {
      from = `${now.getFullYear()}-01-01`;
      to = `${now.getFullYear()}-12-31`;
    } else {
      from = customFrom;
      to = customTo;
    }
    
    return { from, to };
  }, [periodType, month, customFrom, customTo]);

  async function fetchReport() {
    if (!dateRange.from || !dateRange.to) return;
    
    setIsLoading(true);
    setError('');
    try {
      const resp = await apiFetch<any>(`/rapports/financier?from=${dateRange.from}&to=${dateRange.to}`);
      setData(resp);
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la génération du rapport');
    } finally {
      setIsLoading(false);
    }
  }

  // Calculer les mois uniques compris dans la période
  const monthsOfPeriod = useMemo(() => {
    const list: { mois: number; annee: number; label: string; key: string }[] = [];
    const MONTH_LABELS = [
      'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];

    if (periodType === 'MOIS' && month) {
      const [y, m] = month.split('-').map(Number);
      if (y && m) {
        list.push({
          mois: m,
          annee: y,
          label: `${MONTH_LABELS[m - 1]} ${y}`,
          key: `${y}-${m}`
        });
      }
    } else if (periodType === 'TRIMESTRE') {
      const now = new Date();
      const m = now.getMonth();
      const qStartMonth = m - (m % 3);
      const year = now.getFullYear();
      for (let i = 0; i < 3; i++) {
        const curM = qStartMonth + i;
        list.push({
          mois: curM + 1,
          annee: year,
          label: `${MONTH_LABELS[curM]} ${year}`,
          key: `${year}-${curM + 1}`
        });
      }
    } else if (periodType === 'ANNEE') {
      const now = new Date();
      const year = now.getFullYear();
      for (let i = 0; i < 12; i++) {
        list.push({
          mois: i + 1,
          annee: year,
          label: `${MONTH_LABELS[i]} ${year}`,
          key: `${year}-${i + 1}`
        });
      }
    } else if (periodType === 'CUSTOM' && customFrom && customTo) {
      const start = new Date(customFrom);
      const end = new Date(customTo);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        const current = new Date(start.getFullYear(), start.getMonth(), 1);
        while (current <= end) {
          const m = current.getMonth();
          const y = current.getFullYear();
          list.push({
            mois: m + 1,
            annee: y,
            label: `${MONTH_LABELS[m]} ${y}`,
            key: `${y}-${m + 1}`
          });
          current.setMonth(current.getMonth() + 1);
        }
      }
    }

    return list;
  }, [periodType, month, customFrom, customTo]);

  // Charger les masses salariales correspondantes
  useEffect(() => {
    if (monthsOfPeriod.length === 0) return;
    
    async function loadMasseSalariale() {
      try {
        const first = monthsOfPeriod[0];
        const last = monthsOfPeriod[monthsOfPeriod.length - 1];
        const data = await apiFetch<any[]>(
          `/masse-salariale/range?fromMonth=${first.mois}&fromYear=${first.annee}&toMonth=${last.mois}&toYear=${last.annee}`
        );
        setMasseSalarialeList(data);
      } catch (err) {
        console.error('Erreur de chargement de la masse salariale:', err);
      }
    }
    
    loadMasseSalariale();
  }, [monthsOfPeriod]);

  // Associer chaque mois à son enregistrement
  const masseSalarialeByMonth = useMemo(() => {
    return monthsOfPeriod.map(m => {
      const record = masseSalarialeList.find(r => r.mois === m.mois && r.annee === m.annee);
      return {
        ...m,
        id: record?.id || null,
        montant: record?.montant ?? null,
        note: record?.note ?? '',
        createdAt: record?.createdAt || null
      };
    });
  }, [monthsOfPeriod, masseSalarialeList]);

  const totalMasseSalarialeSaisie = useMemo(() => {
    return masseSalarialeByMonth.reduce(
      (sum, m) => sum + (m.montant !== null ? m.montant : totalDefaut), 0
    );
  }, [masseSalarialeByMonth, totalDefaut]);

  const pourcentageMasseSalariale = useMemo(() => {
    const encaisse = data?.revenus?.encaisse || 0;
    return encaisse > 0 ? (totalMasseSalarialeSaisie / encaisse) * 100 : 0;
  }, [totalMasseSalarialeSaisie, data]);

  const handleStartEdit = (key: string, montant: number | null, note: string) => {
    setEditingKeys(prev => ({
      ...prev,
      [key]: {
        montant: montant !== null ? montant.toString() : '',
        note: note || ''
      }
    }));
  };

  const handleSaveMasseSalariale = async (key: string, mois: number, annee: number) => {
    const editState = editingKeys[key];
    if (!editState) return;

    const parsedM = parseFloat(editState.montant);
    if (isNaN(parsedM) || parsedM < 0) {
      alert("Veuillez saisir un montant de masse salariale positif.");
      return;
    }

    try {
      const savedRecord = await apiFetch<any>('/masse-salariale', {
        method: 'POST',
        body: JSON.stringify({
          mois,
          annee,
          montant: parsedM,
          note: editState.note
        })
      });

      setMasseSalarialeList(prev => {
        const exists = prev.some(r => r.mois === mois && r.annee === annee);
        if (exists) {
          return prev.map(r => (r.mois === mois && r.annee === annee) ? savedRecord : r);
        } else {
          return [...prev, savedRecord];
        }
      });

      setEditingKeys(prev => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    } catch (err: any) {
      alert("Erreur lors de l'enregistrement de la masse salariale : " + err.message);
    }
  };

  const handleCancelEdit = (key: string) => {
    setEditingKeys(prev => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const exportPDF = () => {
    if (!data) return;
    
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(22);
    doc.text("CSHP - Rapport Financier & Opérationnel", 14, 20);
    
    doc.setFontSize(11);
    doc.text(`Période : Du ${dateRange.from} au ${dateRange.to}`, 14, 28);
    doc.text(`Édité le : ${formatDateLocal(new Date())}`, 14, 34);
    
    let yPos = 45;

    // 1. Revenus
    doc.setFontSize(14);
    doc.text("1. Résumé Financier", 14, yPos);
    yPos += 8;
    
    autoTable(doc, {
      startY: yPos,
      head: [['Métrique', 'Montant']],
      body: [
        ['Encaissé', formatMontant(data.revenus.encaisse)],
        ['En attente', formatMontant(data.revenus.enAttente)],
        ['En retard', formatMontant(data.revenus.enRetard)],
        ['Total prévu', formatMontant(data.revenus.total)]
      ],
      theme: 'grid',
      headStyles: { fillColor: [219, 39, 119] } // CSHP Red-ish
    });
    yPos = (doc as any).lastAutoTable.finalY + 15;

    // 2. Par section
    doc.setFontSize(14);
    doc.text("2. Revenus par Section", 14, yPos);
    yPos += 8;
    
    autoTable(doc, {
      startY: yPos,
      head: [['Section', 'Montant Total', 'Encaissé', 'En attente', 'En retard', 'Part %']],
      body: data.parSection.map((s: any) => [
        s.label || s.section, 
        formatMontant(s.montantTotal), 
        formatMontant(s.encaisse),
        formatMontant(s.enAttente),
        formatMontant(s.enRetard),
        `${s.pourcentage.toFixed(1)} %`
      ]),
      theme: 'striped',
    });
    yPos = (doc as any).lastAutoTable.finalY + 15;

    // Check page break
    if (yPos > 250) { doc.addPage(); yPos = 20; }

    // 3. Masse Salariale
    doc.setFontSize(14);
    doc.text("3. Masse Salariale", 14, yPos);
    yPos += 8;
    doc.setFontSize(12);
    doc.text(`Montant : ${formatMontant(totalMasseSalarialeSaisie)}`, 14, yPos); yPos += 6;
    doc.text(`Représente ${pourcentageMasseSalariale.toFixed(1)} % des revenus encaissés.`, 14, yPos);
    yPos += 15;
    
    // Check page break
    if (yPos > 250) { doc.addPage(); yPos = 20; }

    // 4. Présences
    doc.setFontSize(14);
    doc.text("4. Taux de Présence par Section", 14, yPos);
    yPos += 8;
    
    autoTable(doc, {
      startY: yPos,
      head: [['Section', 'Taux de présence', 'Présences / Total']],
      body: data.presences.map((p: any) => [
        getLabel(p.section) || p.section, 
        `${p.taux.toFixed(1)} %`,
        `${p.presents} / ${p.total}`
      ]),
      theme: 'striped'
    });
    yPos = (doc as any).lastAutoTable.finalY + 15;

    // Check page break
    if (yPos > 230) { doc.addPage(); yPos = 20; }

    // 5. Retards détaillés
    doc.setFontSize(14);
    doc.text("5. Retards de Paiement", 14, yPos);
    yPos += 8;
    
    if (data.retards.length > 0) {
      autoTable(doc, {
        startY: yPos,
        head: [['Membre', 'Section', 'Montant', 'Échéance', 'Ancienneté']],
        body: data.retards.map((r: any) => [
          r.membreNom, 
          getLabel(r.section) || r.section, 
          formatMontant(r.montant),
          formatDateLocal(r.date),
          `${r.joursRetard} jours`
        ]),
        theme: 'grid'
      });
    } else {
      doc.setFontSize(11);
      doc.text("Aucun retard signalé.", 14, yPos);
    }

    doc.save(`CSHP_Rapport_${dateRange.from}_au_${dateRange.to}.pdf`);
  };

  const exportCSV = async (type: 'PAIEMENTS' | 'PRESENCES') => {
    try {
      const resp = await apiFetch<any[]>(`/rapports/export-csv?type=${type}&from=${dateRange.from}&to=${dateRange.to}`);
      
      let csvContent = '\uFEFF';
      
      if (type === 'PAIEMENTS') {
        csvContent += "ID,Nom,Section,Montant,Statut,Echeance,PayeLe\n";
        resp.forEach(r => {
          const lastName = r.member?.lastName ?? '';
          const firstName = r.member?.firstName ?? '';
          const nom = `${lastName} ${firstName}`.replace(/"/g, '""');
          const section = r.subscription?.section || '';
          const due = formatDateLocal(r.dueDate);
          const paid = r.paidDate ? formatDateLocal(r.paidDate) : '';
          csvContent += `"${r.id}","${nom}","${section}","${r.amount}","${r.status}","${due}","${paid}"\n`;
        });
      } else if (type === 'PRESENCES') {
        csvContent += "ID,Nom,Section,Date,Statut\n";
        resp.forEach(r => {
          const lastName = r.member?.lastName ?? '';
          const firstName = r.member?.firstName ?? '';
          const nom = `${lastName} ${firstName}`.replace(/"/g, '""');
          const section = r.course?.section || '';
          const date = formatDateLocal(r.date);
          csvContent += `"${r.id}","${nom}","${section}","${date}","${r.status}"\n`;
        });
      }
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `CSHP_${type}_${dateRange.from}_au_${dateRange.to}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      alert("Erreur export : " + err.message);
    }
  };

  const [filtreSection, setFiltreSection] = useState<string>('TOUTES');

  const retardsFiltres = useMemo(() => {
    if (filtreSection === 'TOUTES') return data?.retards ?? [];
    return (data?.retards ?? []).filter((r: any) => r.section === filtreSection);
  }, [data, filtreSection]);

  function exportRetardsPDF(retards: any[]) {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('CSHP — Retards de paiement', 14, 20);
    doc.setFontSize(10);
    const sectionLabel = filtreSection === 'TOUTES'
      ? 'Toutes les sections'
      : (data.parSection.find((s: any) => s.section === filtreSection)?.label || filtreSection);
    doc.text(`Section : ${sectionLabel}`, 14, 28);
    doc.text(`Édité le : ${formatDateLocal(new Date())}`, 14, 34);
    doc.text(`${retards.length} dossier(s) · Total : ${formatMontant(retards.reduce((s, r) => s + r.montant, 0))}`, 14, 40);
    
    autoTable(doc, {
      startY: 48,
      head: [['Membre', 'Section', 'Montant', 'Depuis', 'Ancienneté']],
      body: retards.map(r => [
        r.membreNom,
        getLabel(r.section) || r.section,
        formatMontant(r.montant),
        formatDateLocal(r.date),
        `${r.joursRetard} jours`
      ]),
      theme: 'grid',
      headStyles: { fillColor: [225, 29, 72] }
    });
    doc.save(`CSHP_Retards_${sectionLabel}_${dateRange.from}.pdf`);
  }

  function exportRetardsCSV(retards: any[]) {
    let csv = '\uFEFF';
    csv += 'Membre,Section,Montant,Depuis,Ancienneté (jours)\n';
    retards.forEach(r => {
      csv += `"${r.membreNom}","${getLabel(r.section) || r.section}","${r.montant}","${formatDateLocal(r.date)}","${r.joursRetard}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `CSHP_Retards_${filtreSection}_${dateRange.from}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-2xl md:text-3xl font-bold text-cshp-black flex items-center gap-2">
          <FileText className="text-cshp-red" />
          Rapports
        </h1>
        <div className="flex gap-2 w-full md:w-auto">
          <Button onClick={exportPDF} disabled={!data || isLoading} className="flex-1 md:flex-none">
            <Download size={18} className="mr-2" /> PDF
          </Button>
          <Button onClick={() => exportCSV('PAIEMENTS')} variant="outline" disabled={!data || isLoading} className="flex-1 md:flex-none" title="Exporter Paiements">
            <Download size={18} className="mr-2" /> CSV Paiements
          </Button>
          <Button onClick={() => exportCSV('PRESENCES')} variant="outline" disabled={!data || isLoading} className="flex-1 md:flex-none" title="Exporter Présences">
            <Download size={18} className="mr-2" /> CSV Présences
          </Button>
        </div>
      </div>

      {/* Barre de filtres */}
      <Card className="p-4 flex flex-col md:flex-row gap-4">
        <div className="flex bg-gray-100 rounded-lg p-1 shrink-0 overflow-x-auto">
          {['MOIS', 'TRIMESTRE', 'ANNEE', 'CUSTOM'].map(t => (
            <button
              key={t}
              onClick={() => setPeriodType(t)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                periodType === t ? 'bg-white shadow text-cshp-black' : 'text-cshp-gray'
              }`}
            >
              {t === 'MOIS' ? 'Ce mois' : t === 'TRIMESTRE' ? 'Trimestre' : t === 'ANNEE' ? 'Année' : 'Personnalisé'}
            </button>
          ))}
        </div>
        
        <div className="flex gap-2 items-center">
          {periodType === 'MOIS' && (
             <input 
               type="month" 
               value={month} 
               onChange={(e) => setMonth(e.target.value)} 
               className="border border-gray-300 rounded px-3 py-2 text-sm"
             />
          )}
          {periodType === 'CUSTOM' && (
            <>
              <input 
                type="date" 
                value={customFrom} 
                onChange={(e) => setCustomFrom(e.target.value)} 
                className="border border-gray-300 rounded px-3 py-2 text-sm"
              />
              <span className="text-cshp-gray">à</span>
              <input 
                type="date" 
                value={customTo} 
                onChange={(e) => setCustomTo(e.target.value)} 
                className="border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </>
          )}
        </div>
      </Card>

      {/* Contenu du rapport */}
      {isLoading ? (
        <div className="flex justify-center p-12"><Spinner /></div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-600 rounded-lg">{error}</div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          <Card className="p-6">
            <h3 className="text-sm font-bold text-cshp-gray tracking-wider mb-4 uppercase">Revenus</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-end border-b border-gray-100 pb-2">
                <span className="text-cshp-black">Encaissé</span>
                <span className="text-xl font-bold text-green-600">{formatMontant(data.revenus.encaisse)}</span>
              </div>
              <div className="flex justify-between items-end border-b border-gray-100 pb-2">
                <span className="text-cshp-black">En attente</span>
                <span className="text-lg font-medium text-yellow-600">{formatMontant(data.revenus.enAttente)}</span>
              </div>
              <div className="flex justify-between items-end border-b border-gray-100 pb-2">
                <span className="text-cshp-black">En retard</span>
                <span className="text-lg font-medium text-cshp-red">{formatMontant(data.revenus.enRetard)}</span>
              </div>
              <div className="flex justify-between items-end pt-2">
                <span className="font-bold text-cshp-black">Total prévu</span>
                <span className="text-2xl font-bold text-cshp-black">{formatMontant(data.revenus.total)}</span>
              </div>

              {(() => {
                const tauxRecouvrement = data.revenus.total > 0
                  ? (data.revenus.encaisse / data.revenus.total) * 100
                  : 0;

                const recouvrementColor =
                  tauxRecouvrement >= 90 ? { text: 'text-green-600', bg: 'bg-green-500' } :
                  tauxRecouvrement >= 70 ? { text: 'text-yellow-600', bg: 'bg-yellow-400' } :
                                           { text: 'text-red-600',    bg: 'bg-red-500'   };

                return (
                  <div className="pt-4 border-t border-gray-100">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-cshp-gray font-medium">Taux de recouvrement</span>
                      <span className={`font-bold text-lg ${recouvrementColor.text}`}>
                        {tauxRecouvrement.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 h-3 rounded-full overflow-hidden">
                      <div
                        className={`${recouvrementColor.bg} h-full rounded-full transition-all`}
                        style={{ width: `${Math.min(tauxRecouvrement, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-cshp-gray mt-1">
                      Encaissé / Total prévu × 100
                    </p>
                  </div>
                );
              })()}

              <div className="pt-4 border-t border-gray-100 mt-4">
                <h4 className="text-xs font-bold text-cshp-gray mb-3 uppercase tracking-wider">Détails par Section</h4>
                <div className="grid grid-cols-1 gap-3">
                  {data.parSection.map((s: any) => (
                    <SectionCard key={s.section} s={s} />
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <div className="space-y-4 flex flex-col">
            <Card className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-cshp-gray tracking-wider uppercase">Masse Salariale</h3>
                <Button
                  variant="outline"
                  className="h-8 text-xs px-2.5 min-h-0"
                  onClick={() => setShowCoachConfig(!showCoachConfig)}
                >
                  {showCoachConfig ? 'Close' : '⚙️ Gérer les coachs'}
                </Button>
              </div>

              {showCoachConfig && (
                <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
                  <div className="text-xs font-bold text-cshp-gray uppercase tracking-wider mb-2">Salaire fixe par coach</div>
                  {coachs.length === 0 ? (
                    <p className="text-xs text-cshp-gray italic">Aucun coach fixe enregistré.</p>
                  ) : (
                    <div className="space-y-2">
                      {coachs.map(c => (
                        <div key={c.id} className="flex items-center gap-2 text-sm justify-between bg-white p-2 rounded-lg border border-gray-100">
                          <span className="font-semibold text-cshp-black">👤 {c.nom}</span>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={editingCoach[c.id] ?? c.montant}
                              onChange={e => setEditingCoach(prev => ({ ...prev, [c.id]: e.target.value }))}
                              className="w-20 border border-gray-300 rounded px-1.5 py-1 text-xs text-right bg-white focus:outline-none focus:ring-1 focus:ring-cshp-red"
                            />
                            <span className="text-cshp-gray text-xs mr-2">$/m</span>
                            <button
                              onClick={async () => {
                                const mVal = editingCoach[c.id] === undefined ? c.montant : parseFloat(editingCoach[c.id]);
                                if (isNaN(mVal) || mVal < 0) return;
                                try {
                                  await apiFetch(`/coach-salaire/${c.id}`, {
                                    method: 'PUT',
                                    body: JSON.stringify({ montant: mVal })
                                  });
                                  setCoachs(prev => prev.map(x => x.id === c.id ? { ...x, montant: mVal } : x));
                                  setEditingCoach(prev => { const copy = { ...prev }; delete copy[c.id]; return copy; });
                                } catch (e: any) {
                                  alert(e.message);
                                }
                              }}
                              className="text-xs bg-green-500 text-white rounded p-1 hover:bg-opacity-90"
                              title="Valider"
                            >
                              ✓
                            </button>
                            <button
                              onClick={async () => {
                                if (!confirm(`Supprimer le coach ${c.nom} ?`)) return;
                                try {
                                  await apiFetch(`/coach-salaire/${c.id}`, { method: 'DELETE' });
                                  setCoachs(prev => prev.filter(x => x.id !== c.id));
                                } catch (e: any) {
                                  alert(e.message);
                                }
                              }}
                              className="text-xs bg-red-500 text-white rounded p-1 hover:bg-opacity-90"
                              title="Supprimer"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Formulaire ajout */}
                  <div className="flex gap-2 pt-2 border-t border-gray-200">
                    <input
                      type="text"
                      placeholder="Nom coach"
                      value={newCoach.nom}
                      onChange={e => setNewCoach(p => ({ ...p, nom: e.target.value }))}
                      className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-cshp-red"
                    />
                    <input
                      type="number"
                      placeholder="$/m"
                      value={newCoach.montant}
                      onChange={e => setNewCoach(p => ({ ...p, montant: e.target.value }))}
                      className="w-16 border border-gray-300 rounded px-2 py-1 text-xs text-right bg-white focus:outline-none focus:ring-1 focus:ring-cshp-red"
                    />
                    <button
                      onClick={async () => {
                        const mVal = parseFloat(newCoach.montant);
                        if (!newCoach.nom || isNaN(mVal) || mVal < 0) {
                          alert('Champs invalides');
                          return;
                        }
                        try {
                          const created = await apiFetch<any>('/coach-salaire', {
                            method: 'POST',
                            body: JSON.stringify({ nom: newCoach.nom, montant: mVal })
                          });
                          setCoachs(prev => [...prev, created]);
                          setNewCoach({ nom: '', montant: '' });
                        } catch (e: any) {
                          alert(e.message);
                        }
                      }}
                      className="px-2.5 py-1 bg-cshp-red text-white text-xs font-bold rounded hover:bg-opacity-90"
                    >
                      + Ajouter
                    </button>
                  </div>

                  <div className="pt-2 text-xs font-bold text-cshp-black border-t border-gray-200 flex justify-between">
                    <span>Total fixe de référence :</span>
                    <span>{formatMontant(totalDefaut)}</span>
                  </div>
                </div>
              )}
              
              {periodType === 'MOIS' ? (
                // Vue pour un mois unique
                masseSalarialeByMonth.map(m => {
                  const key = m.key;
                  const isEditing = !!editingKeys[key];
                  return (
                    <div key={key}>
                      {!isEditing ? (
                        <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-100">
                          <div>
                            <h4 className="text-sm font-semibold text-cshp-black mb-1">
                              Masse salariale — {m.label}
                            </h4>
                            {m.montant !== null ? (
                              <span className="text-2xl font-bold text-cshp-black">
                                {formatMontant(m.montant)}
                              </span>
                            ) : (
                              <div className="flex flex-col">
                                <span className="text-2xl font-bold text-gray-500">
                                  {formatMontant(totalDefaut)}
                                </span>
                                <span className="text-[10px] text-green-600 font-semibold">(Par défaut)</span>
                              </div>
                            )}
                            {m.note && (
                              <p className="text-xs text-cshp-gray mt-1">Note : {m.note}</p>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            className="h-10 text-sm whitespace-nowrap px-3 min-h-0"
                            onClick={() => handleStartEdit(key, m.montant, m.note)}
                          >
                            ✏️ {m.montant !== null ? 'Modifier' : 'Spécifier'}
                          </Button>
                        </div>
                      ) : (
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
                          <h4 className="text-sm font-semibold text-cshp-black">
                            Masse salariale — {m.label}
                          </h4>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="number"
                              value={editingKeys[key]?.montant ?? ''}
                              onChange={(e) => setEditingKeys(prev => ({
                                ...prev,
                                [key]: { ...prev[key], montant: e.target.value }
                              }))}
                              placeholder="Montant ($)"
                              className="border border-gray-300 rounded px-3 py-1.5 text-sm w-full sm:w-32 focus:outline-none focus:ring-1 focus:ring-cshp-red bg-white"
                            />
                            <input
                              type="text"
                              value={editingKeys[key]?.note ?? ''}
                              onChange={(e) => setEditingKeys(prev => ({
                                ...prev,
                                [key]: { ...prev[key], note: e.target.value }
                              }))}
                              placeholder="Note (optionnelle)"
                              className="border border-gray-300 rounded px-3 py-1.5 text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-cshp-red bg-white"
                            />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button
                              variant="outline"
                              className="h-10 text-sm px-3 min-h-0"
                              onClick={() => handleCancelEdit(key)}
                            >
                              Annuler
                            </Button>
                            <Button
                              className="h-10 text-sm px-3 min-h-0"
                              onClick={() => handleSaveMasseSalariale(key, m.mois, m.annee)}
                            >
                              Sauvegarder
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                // Vue multi-mois (trimestre, année, personnalisé)
                <div className="space-y-3">
                  <div className="divide-y divide-gray-100">
                    {masseSalarialeByMonth.map(m => {
                      const key = m.key;
                      const isEditing = !!editingKeys[key];
                      return (
                        <div key={key} className="py-2.5">
                          {!isEditing ? (
                            <div className="flex justify-between items-center">
                              <div>
                                <span className="font-semibold text-sm text-cshp-black mr-2">
                                  {m.label} :
                                </span>
                                {m.montant !== null ? (
                                  <span className="font-bold text-sm text-cshp-black">
                                    {formatMontant(m.montant)}
                                  </span>
                                ) : (
                                  <span className="font-semibold text-sm text-gray-500 cursor-help" title="Calculé par d'après les salaires fixes des coachs">
                                    {formatMontant(totalDefaut)} <span className="text-xs text-green-600 font-semibold">(défaut)</span>
                                  </span>
                                )}
                                {m.note && (
                                  <span className="text-xs text-cshp-gray ml-2">({m.note})</span>
                                )}
                              </div>
                              <button
                                onClick={() => handleStartEdit(key, m.montant, m.note)}
                                className="text-xs font-semibold text-cshp-red hover:underline flex items-center gap-1 min-h-[36px] px-2 rounded hover:bg-gray-50 border border-transparent"
                                title="Saisir / Modifier"
                              >
                                ✏️ {m.montant !== null ? 'Modifier' : 'Spécifier'}
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-2 py-1">
                              <span className="text-xs font-bold text-cshp-black">{m.label}</span>
                              <div className="flex flex-col sm:flex-row gap-2">
                                <input
                                  type="number"
                                  value={editingKeys[key]?.montant ?? ''}
                                  onChange={(e) => setEditingKeys(prev => ({
                                    ...prev,
                                    [key]: { ...prev[key], montant: e.target.value }
                                  }))}
                                  placeholder="Montant"
                                  className="border border-gray-300 rounded px-2 py-1 text-sm w-full sm:w-28 focus:outline-none focus:ring-1 focus:ring-cshp-red bg-white"
                                />
                                <input
                                  type="text"
                                  value={editingKeys[key]?.note ?? ''}
                                  onChange={(e) => setEditingKeys(prev => ({
                                    ...prev,
                                    [key]: { ...prev[key], note: e.target.value }
                                  }))}
                                  placeholder="Note"
                                  className="border border-gray-300 rounded px-2 py-1 text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-cshp-red bg-white"
                                />
                                <div className="flex gap-1 justify-end">
                                  <button
                                    onClick={() => handleCancelEdit(key)}
                                    className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 text-cshp-gray transition-colors"
                                  >
                                    Annuler
                                  </button>
                                  <button
                                    onClick={() => handleSaveMasseSalariale(key, m.mois, m.annee)}
                                    className="px-2.5 py-1 text-xs bg-cshp-red text-white font-semibold rounded hover:bg-opacity-90 transition-colors"
                                  >
                                    Enregistrer
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  
                  <div className="border-t border-gray-200 pt-3 flex justify-between font-bold text-sm text-cshp-black">
                    <span>Total</span>
                    <span>{formatMontant(totalMasseSalarialeSaisie)}</span>
                  </div>
                </div>
              )}
              
              <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-cshp-gray">
                Représente <strong className="text-cshp-black">{pourcentageMasseSalariale.toFixed(1)} %</strong> des revenus encaissés.
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-sm font-bold text-cshp-gray tracking-wider mb-4 uppercase">Présences</h3>
              <div className="space-y-3">
                {data.presences.map((p: any) => (
                  <div key={p.section} className="flex justify-between items-center text-sm border-b border-gray-50 last:border-0 pb-2 last:pb-0">
                    <span className="font-medium text-cshp-black">{p.section}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-cshp-black">{p.taux.toFixed(0)}%</span>
                      <span className="text-cshp-gray w-16 text-right">({p.presents}/{p.total})</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

          </div>
          
        </div>

        {/* Section Donut Chart et Liste des retards en pleine largeur */}
        <div className="space-y-6 mt-6">
          <Card className="p-6">
            <h3 className="text-sm font-bold text-cshp-gray tracking-wider mb-4 uppercase">
              Répartition des revenus par section
            </h3>
            <div className="h-[350px] w-full">
              <SectionPieChart sections={data.parSection} total={data.revenus.total} />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <div>
                <h3 className="text-sm font-bold text-cshp-gray tracking-wider uppercase">Liste des retards</h3>
                <p className="text-xs text-cshp-gray">Paiements de membres en statut retard cumulatif</p>
              </div>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto items-center">
                <select
                  value={filtreSection}
                  onChange={(e) => setFiltreSection(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-cshp-red"
                >
                  <option value="TOUTES">Toutes les sections</option>
                  {data.parSection.map((s: any) => (
                    <option key={s.section} value={s.section}>
                      {s.label || s.section}
                    </option>
                  ))}
                </select>
                <Button
                  onClick={() => exportRetardsPDF(retardsFiltres)}
                  variant="outline"
                  className="h-8 text-xs px-2.5 min-h-0"
                  disabled={retardsFiltres.length === 0}
                  title="Télécharger PDF des retards visibles"
                >
                  PDF Retards
                </Button>
                <Button
                  onClick={() => exportRetardsCSV(retardsFiltres)}
                  variant="outline"
                  className="h-8 text-xs px-2.5 min-h-0"
                  disabled={retardsFiltres.length === 0}
                  title="Exporter CSV des retards visibles"
                >
                  CSV Retards
                </Button>
              </div>
            </div>

            {/* Alerte globale sur les retards affichés */}
            <div className={`p-4 rounded-xl border mb-6 font-bold text-sm flex flex-col sm:flex-row gap-2 justify-between items-start sm:items-center ${
              retardsFiltres.length > 0 
                ? 'bg-red-50 text-red-600 border-red-100' 
                : 'bg-gray-50 text-gray-500 border-gray-100'
            }`}>
              <span>⚠️ {retardsFiltres.length} dossier(s) en retard affiché(s)</span>
              <span>Total : {formatMontant(retardsFiltres.reduce((s, r) => s + r.montant, 0))}</span>
            </div>
            
            <div className="overflow-x-auto w-full">
              {retardsFiltres.length === 0 ? (
                <p className="text-sm text-cshp-gray italic text-center py-4">Aucun retard signalé pour cette section.</p>
              ) : (
                <table className="w-full text-left text-sm border-collapse min-w-[500px]">
                  <thead>
                    <tr className="border-b border-gray-200 text-cshp-gray text-xs uppercase tracking-wider font-semibold">
                      <th className="pb-3 pr-2">Membre</th>
                      <th className="pb-3 px-2">Section</th>
                      <th className="pb-3 px-2">Montant</th>
                      <th className="pb-3 px-2">Depuis</th>
                      <th className="pb-3 pl-2">Ancienneté</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {retardsFiltres.map((r: any, idx: number) => {
                      let colorClass = "text-gray-500";
                      if (r.joursRetard >= 90) {
                        colorClass = "text-red-600 font-bold";
                      } else if (r.joursRetard >= 60) {
                        colorClass = "text-orange-500 font-semibold";
                      } else if (r.joursRetard >= 30) {
                        colorClass = "text-yellow-600";
                      }
                      
                      return (
                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                          <td className="py-3 pr-2 font-bold text-cshp-black">{r.membreNom}</td>
                          <td className="py-3 px-2 text-cshp-gray">{getLabel(r.section) || r.section}</td>
                          <td className="py-3 px-2 font-bold text-cshp-black">{formatMontant(r.montant)}</td>
                          <td className="py-3 px-2 text-cshp-gray">
                            {formatDateLocal(r.date, { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td className={`py-3 pl-2 ${colorClass}`}>
                            {r.joursRetard} jours
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>
      </>
      ) : null}

    </div>
  );
}
