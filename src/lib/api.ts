const BASE_URL = '/api';

export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('cshp_token');
  const cleanToken = (token ?? '').trim();
  
  const headers = {
    'Content-Type': 'application/json',
    ...(cleanToken ? { Authorization: `Bearer ${cleanToken}` } : {}),
    ...options.headers,
  };

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

export async function createMembre(data: any): Promise<any> {
  return apiFetch('/membres', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateMembre(id: string, data: any): Promise<any> {
  return apiFetch(`/membres/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getMembre(id: string): Promise<any> {
  return apiFetch(`/membres/${id}`);
}

export async function payerVersement(id: string, data: any): Promise<any> {
  return apiFetch(`/versements/${id}/payer`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
