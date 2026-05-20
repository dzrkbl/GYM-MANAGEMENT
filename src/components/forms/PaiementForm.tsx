import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface PaiementFormProps {
  amount: number;
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
}

export function PaiementForm({ amount, onSubmit, onCancel, isLoading }: PaiementFormProps) {
  const [formData, setFormData] = useState({
    amount: amount,
    method: 'COMPTANT',
    date: new Date().toISOString().split('T')[0],
    note: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'amount' ? parseFloat(value) || 0 : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      amount: formData.amount,
      method: formData.method,
      paidDate: new Date(formData.date).toISOString()
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Montant ($)"
        name="amount"
        type="number"
        step="0.01"
        value={formData.amount}
        onChange={handleChange}
        required
      />

      <div>
        <label className="block mb-1 text-sm font-medium text-cshp-black">Méthode de paiement</label>
        <select
          name="method"
          value={formData.method}
          onChange={handleChange}
          className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white"
        >
          <option value="COMPTANT">Comptant</option>
          <option value="VIREMENT">Virement Interac</option>
          <option value="CARTE">Carte de crédit/débit</option>
        </select>
      </div>

      <Input
        label="Date du paiement"
        name="date"
        type="date"
        value={formData.date}
        onChange={handleChange}
        required
      />

      <Input
        label="Note (optionnel)"
        name="note"
        value={formData.note}
        onChange={handleChange}
      />

      <div className="flex gap-4 pt-4 border-t border-gray-100">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Annuler
        </Button>
        <Button type="submit" isLoading={isLoading} className="flex-1">
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
