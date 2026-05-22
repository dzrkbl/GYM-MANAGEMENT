import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { AppLayout } from './components/layout/AppLayout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Pointer } from './pages/Pointer';
import { Membres } from './pages/Membres';
import { MembreDetail } from './pages/MembreDetail';
import { Paiements } from './pages/Paiements';
import { Coachs } from './pages/Coachs';
import { Rapports } from './pages/Rapports';
import { Planning } from './pages/Planning';
import { Sections } from './pages/Sections';
import { Finances } from './pages/admin/Finances';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/membres" element={<Membres />} />
            <Route path="/membres/:id" element={<MembreDetail />} />
            <Route path="/pointer" element={<Pointer />} />
            <Route path="/paiements" element={<Paiements />} />
            <Route path="/admin/finances" element={<Finances />} />
            <Route path="/coachs" element={<Coachs />} />
            <Route path="/rapports" element={<Rapports />} />
            <Route path="/planning" element={<Planning />} />
            <Route path="/sections" element={<Sections />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
