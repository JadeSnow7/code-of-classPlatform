import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
    Clock, ChevronLeft, ChevronRight, CheckCircle2, PauseCircle, PlayCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { quizApi, type Question, type QuizAttempt, type QuizSubmitResult, type QuizSummary } from '@/api/quiz';
import { EmptyState, SectionSkeleton } from '@/components/edugraph/SkeletonLoader';

const DEFAULT_COURSE_ID = 1;

const QuizList: React.FC<{
    quizzes: QuizSummary[];
    loading: boolean;
    onStart: (quiz: QuizSummary) => void;
}> = ({ quizzes, loading, onStart }) => {
    if (loading) {
        return (
            <div className="p-5 max-w-2xl mx-auto">
                <SectionSkeleton rows={3} />
            </div>
        );
    }

    if (quizzes.length === 0) {
        return <EmptyState variant="generic" title="暂无测验" description="当前课程还没有发布的测验。" className="py-20" />;
    }

    return (
        <div className="p-5 max-w-2xl mx-auto space-y-4">
            {quizzes.map((quiz) => (
                <div key={quiz.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{quiz.title}</h3>
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{quiz.durationMinutes ?? 0} 分钟</span>
                                <span>{quiz.questionCount ?? 0} 题</span>
                            </div>
                        </div>
                        <span className={cn(
                            'px-2.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0',
                            quiz.status === 'published' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                        )}>
                            {quiz.status === 'published' ? '已发布' : '未开放'}
                        </span>
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">{quiz.description || '按照 Attempt 模型支持断点续答与自动保存。'}</span>
                        <button
                            onClick={() => onStart(quiz)}
                            disabled={quiz.status !== 'published'}
                            className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                            开始测验
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
};

const QuizAttemptView: React.FC<{
    quiz: QuizSummary;
    attempt: QuizAttempt;
    questions: Question[];
    onFinish: (result: QuizSubmitResult) => void;
}> = ({ quiz, attempt, questions, onFinish }) => {
    const [current, setCurrent] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [timeLeft, setTimeLeft] = useState((quiz.durationMinutes ?? 30) * 60);
    const [isPaused, setIsPaused] = useState(false);
    const [autoSaveIndicator, setAutoSaveIndicator] = useState('');

    const saveAnswerMutation = useMutation({
        mutationFn: (payload: Array<{ questionId: string; answer: string }>) => quizApi.updateAttemptAnswers(attempt.id, payload),
        onMutate: () => setAutoSaveIndicator('saving'),
        onSuccess: () => {
            setAutoSaveIndicator('saved');
            window.setTimeout(() => setAutoSaveIndicator(''), 1200);
        },
        onError: () => setAutoSaveIndicator(''),
    });

    const submitMutation = useMutation({
        mutationFn: () => quizApi.submitAttempt(attempt.id),
        onSuccess: onFinish,
    });

    useEffect(() => {
        if (timeLeft > 0 && !isPaused) {
            const timer = window.setTimeout(() => setTimeLeft((value) => value - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [timeLeft, isPaused]);

    const handleSelect = (questionId: string, optionKey: string) => {
        setAnswers((prev) => ({
            ...prev,
            [questionId]: optionKey,
        }));
        void saveAnswerMutation.mutateAsync([{ questionId, answer: optionKey }]);
    };

    const formatTime = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    const currentQuestion = questions[current];
    const answeredCount = Object.keys(answers).length;

    return (
        <div className="h-full flex flex-col bg-[#0a1128] text-white overflow-hidden">
            <header className="flex items-center justify-between h-14 px-5 border-b border-white/10 bg-[#0a1128]/90 backdrop-blur flex-shrink-0">
                <div className="flex items-center gap-2 text-blue-400 font-mono font-bold">
                    <Clock className="w-4 h-4" />
                    <span className={cn('text-lg', timeLeft < 300 && 'text-red-400 animate-pulse')}>{formatTime(timeLeft)}</span>
                </div>
                <div className="flex items-center gap-3">
                    {autoSaveIndicator === 'saving' && <span className="text-xs text-blue-400">保存中...</span>}
                    {autoSaveIndicator === 'saved' && <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> 已保存</span>}
                    <button
                        onClick={() => void submitMutation.mutateAsync()}
                        disabled={submitMutation.isPending}
                        className="px-4 py-1.5 bg-blue-600 text-white text-sm font-bold rounded-full hover:bg-blue-500 transition-all disabled:opacity-50"
                    >
                        交卷
                    </button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                <aside className="hidden md:flex flex-col w-56 border-r border-white/10 p-5 space-y-4">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-3">题目列表</p>
                        <div className="grid grid-cols-4 gap-1.5">
                            {questions.map((_, index) => (
                                <button
                                    key={index}
                                    onClick={() => setCurrent(index)}
                                    className={cn(
                                        'w-9 h-9 rounded-lg text-xs font-bold transition-all',
                                        current === index ? 'bg-blue-600 text-white' :
                                            answers[questions[index].id] !== undefined ? 'bg-white/20 text-white' :
                                                'bg-white/5 text-white/40 hover:bg-white/10'
                                    )}
                                >
                                    {index + 1}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="mt-auto pt-4 border-t border-white/10">
                        <div className="flex justify-between text-[10px] text-white/40 mb-1.5 uppercase tracking-widest">
                            <span>进度</span><span>{answeredCount}/{questions.length}</span>
                        </div>
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 transition-all" style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
                        </div>
                    </div>
                </aside>

                <main className="flex-1 overflow-y-auto p-6 md:p-10">
                    <div className="max-w-2xl mx-auto space-y-8">
                        <div>
                            <p className="font-mono text-[10px] uppercase tracking-widest text-white/40 mb-2">
                                {quiz.title} · 第 {current + 1} 题 / 共 {questions.length} 题 · {currentQuestion.points} 分
                            </p>
                            <h2 className="text-xl font-bold leading-snug">{currentQuestion.content}</h2>
                        </div>

                        <div className="space-y-3">
                            {(Array.isArray(currentQuestion.options) ? currentQuestion.options : []).map((option) => (
                                <button
                                    key={option.key}
                                    onClick={() => handleSelect(String(currentQuestion.id), option.key)}
                                    className={cn(
                                        'w-full text-left px-5 py-4 rounded-2xl border transition-all',
                                        answers[currentQuestion.id] === option.key
                                            ? 'bg-blue-600/20 border-blue-500 ring-1 ring-blue-500'
                                            : 'bg-white/5 border-white/10 hover:bg-white/10'
                                    )}
                                >
                                    <div className="flex items-center gap-4">
                                        <span className={cn(
                                            'w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold',
                                            answers[currentQuestion.id] === option.key ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/40'
                                        )}>
                                            {option.key}
                                        </span>
                                        <span className={cn('text-sm', answers[currentQuestion.id] === option.key ? 'text-white font-medium' : 'text-white/70')}>
                                            {option.label}
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center justify-between pt-4">
                            <button onClick={() => setCurrent((value) => value - 1)} disabled={current === 0} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm disabled:opacity-20 hover:bg-white/10 transition-all">
                                <ChevronLeft className="w-4 h-4" /> 上一题
                            </button>
                            <button onClick={() => setIsPaused((value) => !value)} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all text-blue-400">
                                {isPaused ? <PlayCircle className="w-5 h-5" /> : <PauseCircle className="w-5 h-5" />}
                            </button>
                            <button onClick={() => setCurrent((value) => value + 1)} disabled={current === questions.length - 1} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm disabled:opacity-20 hover:bg-white/10 transition-all">
                                下一题 <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

const QuizResult: React.FC<{ result: QuizSubmitResult; onBack: () => void }> = ({ result, onBack }) => {
    const pct = Math.round((result.score / result.maxScore) * 100);
    return (
        <div className="h-full flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white dark:bg-slate-800 p-10 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-md w-full text-center">
                <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: pct >= 80 ? '#D1FAE5' : pct >= 60 ? '#DBEAFE' : '#FEE2E2' }}>
                    <CheckCircle2 className={cn('w-10 h-10', pct >= 80 ? 'text-green-500' : pct >= 60 ? 'text-blue-500' : 'text-red-400')} />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">测验完成</h2>
                <p className="text-slate-500 mb-6 text-sm">答卷已通过 `quiz-attempts/{'{id}'}/submit` 成功提交。</p>
                <div className="bg-slate-50 dark:bg-slate-900 p-5 rounded-2xl mb-6 flex justify-between text-center">
                    <div><p className="text-[10px] text-slate-400 uppercase tracking-widest">得分</p><p className="text-2xl font-bold text-blue-600">{result.score} <span className="text-base text-slate-400">/ {result.maxScore}</span></p></div>
                    <div><p className="text-[10px] text-slate-400 uppercase tracking-widest">百分比</p><p className="text-2xl font-bold text-purple-600">{pct}%</p></div>
                </div>
                <button onClick={onBack} className="w-full py-3 bg-black text-white font-bold rounded-2xl hover:bg-slate-800 transition-colors">
                    返回测验列表
                </button>
            </motion.div>
        </div>
    );
};

export const Quiz: React.FC = () => {
    const [selectedQuiz, setSelectedQuiz] = useState<QuizSummary | null>(null);
    const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
    const [result, setResult] = useState<QuizSubmitResult | null>(null);

    const quizzesQuery = useQuery({
        queryKey: ['edugraph-quizzes', DEFAULT_COURSE_ID],
        queryFn: async () => {
            const payload = await quizApi.listCourseQuizzes(DEFAULT_COURSE_ID, {
                status: 'published',
                page: 1,
                pageSize: 20,
            });
            return payload.items;
        },
    });

    const detailQuery = useQuery({
        queryKey: ['edugraph-quiz-detail', selectedQuiz?.id],
        queryFn: () => quizApi.getQuizDetail(String(selectedQuiz?.id)),
        enabled: !!selectedQuiz?.id,
    });

    const startAttemptMutation = useMutation({
        mutationFn: async (quiz: QuizSummary) => {
            const createdAttempt = await quizApi.createAttempt(quiz.id);
            return {
                quiz,
                attempt: createdAttempt,
            };
        },
        onSuccess(payload) {
            setAttempt(payload.attempt);
        },
    });

    const currentQuestions = useMemo(() => detailQuery.data?.questions ?? [], [detailQuery.data]);

    if (result) {
        return <QuizResult result={result} onBack={() => {
            setResult(null);
            setAttempt(null);
            setSelectedQuiz(null);
        }} />;
    }

    if (attempt && selectedQuiz && currentQuestions.length > 0) {
        return (
            <QuizAttemptView
                quiz={selectedQuiz}
                attempt={attempt}
                questions={currentQuestions}
                onFinish={(submitResult) => setResult(submitResult)}
            />
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4">
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 px-1">测验列表</h2>
                <QuizList
                    quizzes={quizzesQuery.data ?? []}
                    loading={quizzesQuery.isLoading || detailQuery.isLoading || startAttemptMutation.isPending}
                    onStart={(quiz) => {
                        setSelectedQuiz(quiz);
                        void startAttemptMutation.mutateAsync(quiz);
                    }}
                />
            </div>
        </div>
    );
};
