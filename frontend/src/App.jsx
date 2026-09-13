import { useState, useEffect, Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

// Lazy load admin pages to split the production bundle
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminUserDetail = lazy(() => import('./pages/AdminUserDetail'));

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };

    // Listen to forward/back browser buttons
    window.addEventListener('popstate', handleLocationChange);
    
    // Also check for periodic path polling in case history API is used manually
    const interval = setInterval(() => {
      if (window.location.pathname !== currentPath) {
        setCurrentPath(window.location.pathname);
      }
    }, 500);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      clearInterval(interval);
    };
  }, [currentPath]);

  // Loading Fallback spinner
  const loadingFallback = (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 text-slate-400">
      <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
      <p className="text-sm font-medium">Loading Page...</p>
    </div>
  );

  return (
    <Suspense fallback={loadingFallback}>
      {currentPath.startsWith('/admin/user/') ? (
        <AdminUserDetail />
      ) : (
        <AdminDashboard />
      )}
    </Suspense>
  );
}
