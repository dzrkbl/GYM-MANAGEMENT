import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { Spinner } from '../ui/Spinner';

export function AppLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="h-screen w-full flex items-center justify-center bg-gray-50"><Spinner /></div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pb-[68px] md:pb-0">
        <div className="p-4 md:p-8 max-w-7xl mx-auto min-h-full">
          <Outlet />
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
