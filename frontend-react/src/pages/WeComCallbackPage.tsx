import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/domains/auth/useAuth';

export default function WeComCallbackPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { wecomLogin } = useAuth();
    const processedRef = useRef(false);

    useEffect(() => {
        const code = searchParams.get('code');
        // const state = searchParams.get('state'); // State tracking not fully implemented yet

        if (!code) {
            console.error('No code received from WeChat Work');
            navigate('/login?error=no_wecom_code');
            return;
        }

        if (processedRef.current) return;
        processedRef.current = true;

        wecomLogin(code)
            .then(() => {
                // Determine redirect path from state or default to home
                // state might be "STATE" or encoded URL
                // Simple version: just go to home
                navigate('/');
            })
            .catch((err) => {
                console.error('WeChat Work login failed:', err);
                navigate(`/login?error=${encodeURIComponent(err instanceof Error ? err.message : 'Login failed')}`);
            });
    }, [searchParams, navigate, wecomLogin]);

    return (
        <div className="flex h-screen items-center justify-center bg-gray-50">
            <div className="text-center">
                <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto"></div>
                <h2 className="text-lg font-semibold text-gray-900">正在通过企业微信登录...</h2>
                <p className="text-sm text-gray-500">请稍候</p>
            </div>
        </div>
    );
}
