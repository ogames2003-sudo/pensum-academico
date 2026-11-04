import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router';
import './index.css';
import { initTheme } from './lib/theme';
import { isSupabaseConfigured } from './services/supabase';
import { AuthProvider } from './context/AuthContext';
import { PensumProvider } from './context/PensumContext';
import { ConfirmProvider } from './components/ui/ConfirmDialog';
import { ToastProvider } from './components/ui/Toast';
import { PublicLayout } from './components/layout/PublicLayout';
import { AdminLayout } from './components/layout/AdminLayout';
import { PublicPensumPage } from './pages/PublicPensumPage';
import { ReportPage } from './pages/ReportPage';
import { NotFoundPage, SetupRequiredPage } from './pages/SystemPages';
import { LoginPage } from './pages/admin/LoginPage';
import { DashboardPage } from './pages/admin/DashboardPage';
import { AdminPensumPage } from './pages/admin/AdminPensumPage';
import { CoursesPage } from './pages/admin/CoursesPage';
import { ProgramPage } from './pages/admin/ProgramPage';
import { DataPage } from './pages/admin/DataPage';
import { ADMIN_PATH } from './config';

initTheme();

function Providers() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AuthProvider>
          <PensumProvider>
            <Outlet />
          </PensumProvider>
        </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}

const router = createBrowserRouter(
  isSupabaseConfigured
    ? [
        {
          element: <Providers />,
          children: [
            {
              element: <PublicLayout />,
              children: [{ path: '/', element: <PublicPensumPage /> }],
            },
            { path: '/reporte', element: <ReportPage /> },
            { path: `${ADMIN_PATH}/login`, element: <LoginPage /> },
            {
              path: ADMIN_PATH,
              element: <AdminLayout />,
              children: [
                { index: true, element: <DashboardPage /> },
                { path: 'pensum', element: <AdminPensumPage /> },
                { path: 'cursos', element: <CoursesPage /> },
                { path: 'programa', element: <ProgramPage /> },
                { path: 'datos', element: <DataPage /> },
              ],
            },
            { path: '*', element: <NotFoundPage /> },
          ],
        },
      ]
    : [{ path: '*', element: <SetupRequiredPage /> }],
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
