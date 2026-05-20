import { createContext, useState, useEffect, ReactNode } from 'react';
import { apiFetch } from '../lib/api';

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
          setUser(userData);
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
    setUser(newUser);
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
