import { createContext, useState, useEffect, ReactNode } from 'react';
import { apiFetch } from '../lib/api';

function decodeToken(token: string): any {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window
        .atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

export interface User {
  id: string;
  email: string;
  role: string;
  section?: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  isLoading: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('cshp_token'));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      if (token) {
        try {
          const userData = await apiFetch<User>('/auth/me');
          const decoded = decodeToken(token) || {};
          setUser({
            ...userData,
            section: userData.section ?? decoded.section ?? null
          });
        } catch (error) {
          console.error('Session expirée ou invalide');
          logout();
        }
      }
      setIsLoading(false);
    }
    checkAuth();

    const handleUnauthorized = () => logout();
    window.addEventListener('cshp-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('cshp-unauthorized', handleUnauthorized);
  }, [token]);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('cshp_token', newToken);
    setToken(newToken);
    const decoded = decodeToken(newToken) || {};
    setUser({
      ...newUser,
      section: newUser.section ?? decoded.section ?? null
    });
  };

  const logout = () => {
    localStorage.removeItem('cshp_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}
