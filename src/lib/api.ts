const BASE_URL = '/api';

export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('cshp_token');
  const cleanToken = (token ?? '').trim();
  
  const headers = {
    'Content-Type': 'application/json',
    ...(cleanToken ? { Authorization: `Bearer ${cleanToken}` } : {}),
    ...options.headers,
  };

  console.log('Token envoyé:', cleanToken);

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent('cshp-unauthorized'));
  }

  if (!response.ok) {
    throw new Error(data.error || 'Une erreur est survenue');
  }

  return data.data;
}
