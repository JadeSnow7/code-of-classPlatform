import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/domains/auth/useAuth';
import { Loader2 } from 'lucide-react';

export function ProtectedRoute() {
    const { status } = useAuth();

    if (status === 'idle' || status === 'loading') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-900">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (status === 'unauthenticated') {
        return <Navigate to="/login" replace />;
    }

    return <Outlet />;
}
