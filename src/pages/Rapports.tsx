import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiFetch } from '../lib/api';
import { formatMontant } from '../lib/format';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Navigate } from 'react-router-dom';
import { FileText, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export function Rapports() {
  const { user } = useAuth();
  
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

  const exportPDF = () => {
    if (!data) return;
    
    const doc = new (jsPDF as any)();
    
    // Header
    doc.setFontSize(22);
    doc.text("CSHP - Rapport Financier & Opérationnel", 14, 20);
    
    doc.setFontSize(11);
    doc.text(`Période : Du ${dateRange.from} au ${dateRange.to}`, 14, 28);
    doc.text(`Édité le : ${new Date().toLocaleDateString('fr-CA')}`, 14, 34);
    
    let yPos = 45;

    // 1. Revenus
    doc.setFontSize(14);
    doc.text("1. Résumé Financier", 14, yPos);
    yPos += 8;
    
    (doc as any).autoTable({
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
    
    (doc as any).autoTable({
      startY: yPos,
      head: [['Section', 'Montant', 'Part %']],
      body: data.parSection.map((s: any) => [
        s.section, 
        formatMontant(s.montant), 
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
    doc.text(`Montant : ${formatMontant(data.masseSalariale.montant)}`, 14, yPos); yPos += 6;
    doc.text(`Représente ${data.masseSalariale.pourcentageDuRevenu.toFixed(1)} % des revenus encaissés.`, 14, yPos);
    yPos += 15;
    
    // Check page break
    if (yPos > 250) { doc.addPage(); yPos = 20; }

    // 4. Présences
    doc.setFontSize(14);
    doc.text("4. Taux de Présence par Section", 14, yPos);
    yPos += 8;
    
    (doc as any).autoTable({
      startY: yPos,
      head: [['Section', 'Taux de présence', 'Présences / Total']],
      body: data.presences.map((p: any) => [
        p.section, 
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
      (doc as any).autoTable({
        startY: yPos,
        head: [['Membre', 'Section', 'Montant', 'Échéance']],
        body: data.retards.map((r: any) => [
          r.nom, 
          r.section, 
          formatMontant(r.montant),
          new Date(r.depuisLe).toLocaleDateString('fr-CA')
        ]),
        theme: 'grid'
      });
    } else {
      doc.setFontSize(11);
      doc.text("Aucun retard signalé pour cette période.", 14, yPos);
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
          const due = new Date(r.dueDate).toLocaleDateString('fr-CA');
          const paid = r.paidDate ? new Date(r.paidDate).toLocaleDateString('fr-CA') : '';
          csvContent += `"${r.id}","${nom}","${section}","${r.amount}","${r.status}","${due}","${paid}"\n`;
        });
      } else if (type === 'PRESENCES') {
        csvContent += "ID,Nom,Section,Date,Statut\n";
        resp.forEach(r => {
          const lastName = r.member?.lastName ?? '';
          const firstName = r.member?.firstName ?? '';
          const nom = `${lastName} ${firstName}`.replace(/"/g, '""');
          const section = r.course?.section || '';
          const date = new Date(r.date).toLocaleDateString('fr-CA');
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

              <div className="pt-4 border-t border-gray-100 mt-4">
                <h4 className="text-xs font-bold text-cshp-gray mb-3">PAR SECTION</h4>
                <div className="space-y-2">
                  {data.parSection.map((s: any) => (
                    <div key={s.section} className="flex flex-col">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-cshp-black">{s.section}</span>
                        <div className="flex gap-4">
                          <span className="text-cshp-black font-bold">{formatMontant(s.montant)}</span>
                          <span className="text-cshp-gray w-12 text-right">{s.pourcentage.toFixed(0)}%</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-cshp-red h-full rounded-full" style={{ width: `${s.pourcentage}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <div className="space-y-4 flex flex-col">
            <Card className="p-6">
              <h3 className="text-sm font-bold text-cshp-gray tracking-wider mb-4 uppercase">Masse Salariale</h3>
              <div className="flex justify-between items-center mb-2">
                <span className="text-2xl font-bold text-cshp-black">{formatMontant(data.masseSalariale.montant)}</span>
                <span className="text-sm font-bold bg-gray-100 px-3 py-1 rounded-full text-cshp-gray">
                  / {formatMontant(data.revenus.total)}
                </span>
              </div>
              <p className="text-cshp-gray text-sm">
                Représente <strong className="text-cshp-black">{data.masseSalariale.pourcentageDuRevenu.toFixed(1)} %</strong> des revenus encaissés.
              </p>
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

            <Card className="p-6 flex-1">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-cshp-gray tracking-wider uppercase">Liste des retards</h3>
                <span className="text-xs font-bold bg-red-100 text-red-600 px-2 py-1 rounded-full bg-opacity-50">
                  {data.retards.length} dossier(s)
                </span>
              </div>
              
              <div className="overflow-y-auto max-h-[250px] pr-2">
                {data.retards.length === 0 ? (
                  <p className="text-sm text-cshp-gray italic text-center py-4">Aucun retard</p>
                ) : (
                  <ul className="space-y-2">
                    {data.retards.map((r: any, idx: number) => (
                      <li key={idx} className="flex justify-between items-center p-2 hover:bg-gray-50 rounded-lg text-sm border border-gray-100">
                        <div>
                          <p className="font-bold text-cshp-black">{r.nom}</p>
                          <p className="text-xs text-cshp-gray">{r.section} - Dû le {new Date(r.depuisLe).toLocaleDateString('fr-CA')}</p>
                        </div>
                        <span className="font-bold text-cshp-red">{formatMontant(r.montant)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          </div>
          
        </div>
      ) : null}

    </div>
  );
}
