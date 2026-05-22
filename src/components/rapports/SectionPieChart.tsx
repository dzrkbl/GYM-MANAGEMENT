import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface SectionPieChartProps {
  sections: any[];
  total: number;
}

const COLORS = ['#e11d48', '#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b'];

export function SectionPieChart({ sections, total }: SectionPieChartProps) {
  const data = sections.map(s => ({
    name: s.label || s.section,
    value: s.montantTotal || 0
  })).filter(d => d.value > 0);

  const formatMontant = (amount: number) => {
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(amount);
  };

  const renderLegendText = (value: string) => {
    const item = data.find(d => d.name === value);
    if (item) {
      return (
        <span className="text-xs text-cshp-black font-medium">
          {value} : <span className="font-bold">{formatMontant(item.value)}</span>
        </span>
      );
    }
    return <span className="text-xs text-cshp-black font-medium">{value}</span>;
  };

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[280px] text-sm text-cshp-gray italic">
        Aucune donnée de section à afficher.
      </div>
    );
  }

  return (
    <div className="w-full h-[280px] relative flex justify-center items-center">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="45%"
            innerRadius={65}
            outerRadius={95}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((_entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string) => {
              const pct = total > 0 ? (value / total) * 100 : 0;
              return [`${formatMontant(value)} (${pct.toFixed(1)}%)`, name];
            }}
            contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
          />
          <Legend
            verticalAlign="bottom"
            formatter={renderLegendText}
            iconSize={10}
            iconType="circle"
          />
        </PieChart>
      </ResponsiveContainer>
      
      <div className="absolute flex flex-col justify-center items-center text-center pointer-events-none" style={{ top: 'calc(45% - 22px)' }}>
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest leading-none">Total</span>
        <span className="text-base font-extrabold text-cshp-black mt-1 leading-none">{formatMontant(total)}</span>
      </div>
    </div>
  );
}
