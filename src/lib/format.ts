export function formatMontant(amount: number): string {
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(amount);
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('fr-CA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
