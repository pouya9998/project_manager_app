const API_BASE = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('pmo_token');
}

export async function api<T = any>(
  path: string,
  options: RequestInit & { formData?: FormData } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let body = options.body;
  if (options.formData) {
    body = options.formData;
  } else if (body && typeof body === 'object' && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body,
  });

  if (res.status === 401) {
    localStorage.removeItem('pmo_token');
    localStorage.removeItem('pmo_user');
    if (!window.location.pathname.includes('/login')) {
      window.location.href = '/login';
    }
    throw new Error('نشست منقضی شده است');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.message ||
      (Array.isArray(data?.message) ? data.message.join('، ') : null) ||
      'خطایی رخ داد';
    throw new Error(typeof msg === 'string' ? msg : 'خطایی رخ داد');
  }
  return data as T;
}

export const uploadsUrl = (storedName: string) =>
  `${(import.meta.env.VITE_UPLOADS_URL || '/uploads').replace(/\/$/, '')}/${storedName}`;
