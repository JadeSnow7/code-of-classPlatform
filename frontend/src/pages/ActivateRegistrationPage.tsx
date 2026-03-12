import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, ShieldCheck } from 'lucide-react';
import { authApi } from '@/api/auth';
import type { InvitePreview } from '@classplatform/shared';

export function ActivateRegistrationPage() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const token = params.get('token') ?? '';
    const [invite, setInvite] = useState<InvitePreview | null>(null);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!token) {
            setError('缺少激活令牌');
            setLoading(false);
            return;
        }
        void authApi.getInvite(token)
            .then((data) => {
                setInvite(data);
                if (data.used) {
                    setError('该激活链接已使用');
                } else if (data.expired) {
                    setError('该激活链接已过期');
                }
            })
            .catch((err) => {
                setError(err instanceof Error ? err.message : '激活链接无效');
            })
            .finally(() => {
                setLoading(false);
            });
    }, [token]);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (!token) {
            setError('缺少激活令牌');
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await authApi.activateRegistration(token, password, confirmPassword);
            navigate('/courses');
        } catch (err) {
            setError(err instanceof Error ? err.message : '激活失败');
        } finally {
            setSubmitting(false);
        }
    };

    const disabled = submitting || loading || !invite || invite.used || invite.expired;

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl backdrop-blur">
                <div className="mb-6 text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10">
                        <ShieldCheck className="h-8 w-8 text-emerald-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">激活账号</h1>
                    <p className="mt-2 text-sm text-slate-400">首次设置密码后即可进入平台</p>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-10 text-slate-300">
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        正在校验邀请链接...
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {invite ? (
                            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
                                <div>账号：{invite.username}</div>
                                <div>姓名：{invite.name || '未填写'}</div>
                                <div>角色：{invite.role}</div>
                            </div>
                        ) : null}

                        <div>
                            <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-300">新密码</label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
                                placeholder="至少 8 位，需包含字母和数字"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-slate-300">确认密码</label>
                            <input
                                id="confirmPassword"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
                                placeholder="再次输入密码"
                                required
                            />
                        </div>

                        {error ? (
                            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                                {error}
                            </div>
                        ) : null}

                        <button
                            type="submit"
                            disabled={disabled}
                            className="flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : '完成激活'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
