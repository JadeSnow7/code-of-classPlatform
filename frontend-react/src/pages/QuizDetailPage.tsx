import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
    ArrowLeft, Clock, Trophy, Plus, Trash2,
    AlertCircle, Loader2, Play, Send, Eye, EyeOff
} from 'lucide-react';
import { quizApi, type Quiz, type Question, type QuestionWithAnswer, type QuizAttempt } from '@/api/quiz';
import { authStore } from '@/lib/auth-store';

export function QuizDetailPage() {
    const { courseId, quizId } = useParams<{ courseId: string; quizId: string }>();
    const [quiz, setQuiz] = useState<Quiz | null>(null);
    const [questions, setQuestions] = useState<(Question | QuestionWithAnswer)[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Teacher states
    const [showAddQuestion, setShowAddQuestion] = useState(false);

    // Student states
    const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
    const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [showResult, setShowResult] = useState(false);
    const [resultData, setResultData] = useState<{ score: number; max_score: number } | null>(null);

    const user = authStore.getUser();
    const isTeacher = user?.role === 'admin' || user?.role === 'teacher' || user?.role === 'assistant';

    useEffect(() => {
        if (!quizId) return;
        loadQuiz();
    }, [quizId]);

    // Countdown timer
    useEffect(() => {
        if (!attempt || attempt.submitted_at || !timeLeft) return;

        const interval = setInterval(() => {
            const deadline = new Date(attempt.deadline).getTime();
            const now = Date.now();
            const remaining = Math.max(0, Math.floor((deadline - now) / 1000));
            setTimeLeft(remaining);

            if (remaining <= 0) {
                handleSubmit();
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [attempt, timeLeft]);

    const loadQuiz = async () => {
        if (!quizId) return;
        setIsLoading(true);
        setError(null);
        try {
            const data = await quizApi.get(parseInt(quizId));
            setQuiz(data.quiz);
            setQuestions(data.questions);
        } catch (err: any) {
            setError(err.message || 'Failed to load quiz');
        } finally {
            setIsLoading(false);
        }
    };

    const handlePublish = async () => {
        if (!quizId) return;
        try {
            const updated = await quizApi.publish(parseInt(quizId));
            setQuiz(updated);
        } catch (err: any) {
            alert('发布失败: ' + err.message);
        }
    };

    const handleUnpublish = async () => {
        if (!quizId) return;
        try {
            const updated = await quizApi.unpublish(parseInt(quizId));
            setQuiz(updated);
        } catch (err: any) {
            alert('取消发布失败: ' + err.message);
        }
    };

    const handleDeleteQuestion = async (questionId: number) => {
        if (!confirm('确定要删除这道题目吗？')) return;
        try {
            await quizApi.deleteQuestion(questionId);
            setQuestions(questions.filter(q => q.ID !== questionId));
        } catch (err: any) {
            alert('删除失败: ' + err.message);
        }
    };

    const handleStartQuiz = async () => {
        if (!quizId) return;
        try {
            const data = await quizApi.start(parseInt(quizId));
            setAttempt(data.attempt);
            setQuestions(data.questions);

            // Calculate initial time left
            const deadline = new Date(data.attempt.deadline).getTime();
            const now = Date.now();
            setTimeLeft(Math.max(0, Math.floor((deadline - now) / 1000)));

            // Load saved answers if resuming
            if (data.resumed && data.attempt.answers) {
                try {
                    setAnswers(JSON.parse(data.attempt.answers));
                } catch { }
            }
        } catch (err: any) {
            alert('开始测验失败: ' + err.message);
        }
    };

    const handleSubmit = async () => {
        if (!quizId || isSubmitting) return;
        setIsSubmitting(true);
        try {
            const result = await quizApi.submit(parseInt(quizId), answers);
            setResultData({ score: result.score, max_score: result.max_score });
            setShowResult(true);
            setAttempt(result.attempt);
        } catch (err: any) {
            alert('提交失败: ' + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAnswerChange = (questionId: number, value: string | string[]) => {
        setAnswers(prev => ({
            ...prev,
            [questionId.toString()]: value,
        }));
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (error || !quiz) {
        return (
            <div className="text-center py-12">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <p className="text-gray-400">{error || '测验不存在'}</p>
                <Link to={`/courses/${courseId}/quizzes`} className="text-blue-400 hover:underline mt-4 inline-block">
                    返回测验列表
                </Link>
            </div>
        );
    }

    // Result screen
    if (showResult && resultData) {
        return (
            <div className="max-w-2xl mx-auto text-center py-12">
                <div className="bg-gradient-to-r from-purple-600/20 to-pink-600/20 rounded-2xl p-8 border border-purple-500/20">
                    <Trophy className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
                    <h1 className="text-3xl font-bold text-white mb-2">测验完成！</h1>
                    <p className="text-gray-400 mb-6">你已成功提交答案</p>

                    <div className="text-5xl font-bold text-white mb-2">
                        {resultData.score} / {resultData.max_score}
                    </div>
                    <p className="text-gray-400 mb-8">
                        正确率: {Math.round((resultData.score / resultData.max_score) * 100)}%
                    </p>

                    <Link
                        to={`/courses/${courseId}/quizzes`}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        返回测验列表
                    </Link>
                </div>
            </div>
        );
    }

    // Student taking quiz
    if (attempt && !attempt.submitted_at) {
        return (
            <div className="space-y-6">
                {/* Timer Header */}
                <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur border-b border-gray-700 -mx-6 px-6 py-4">
                    <div className="flex items-center justify-between">
                        <h1 className="text-xl font-bold text-white">{quiz.title}</h1>
                        {timeLeft !== null && (
                            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${timeLeft < 60 ? 'bg-red-500/20 text-red-400' : 'bg-purple-500/20 text-purple-400'
                                }`}>
                                <Clock className="w-4 h-4" />
                                <span className="font-mono font-bold">{formatTime(timeLeft)}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Questions */}
                <div className="space-y-6">
                    {questions.map((q, index) => (
                        <QuestionCard
                            key={q.ID}
                            question={q}
                            index={index}
                            answer={answers[q.ID.toString()]}
                            onChange={(value) => handleAnswerChange(q.ID, value)}
                            readOnly={false}
                        />
                    ))}
                </div>

                {/* Submit Button */}
                <div className="sticky bottom-0 bg-gray-900/95 backdrop-blur border-t border-gray-700 -mx-6 px-6 py-4">
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <Send className="w-5 h-5" />
                        )}
                        提交答案
                    </button>
                </div>
            </div>
        );
    }

    // Teacher view or student pre-start view
    return (
        <div className="space-y-6">
            {/* Back Button */}
            <Link
                to={`/courses/${courseId}/quizzes`}
                className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                返回测验列表
            </Link>

            {/* Quiz Header */}
            <div className="bg-gradient-to-r from-purple-600/20 to-pink-600/20 rounded-2xl p-6 border border-purple-500/20">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white mb-2">{quiz.title}</h1>
                        <p className="text-gray-300">{quiz.description || '暂无描述'}</p>
                    </div>
                    {isTeacher && (
                        <div className="flex gap-2">
                            {quiz.is_published ? (
                                <button
                                    onClick={handleUnpublish}
                                    className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded text-sm hover:bg-yellow-500/30 flex items-center gap-1"
                                >
                                    <EyeOff className="w-4 h-4" />
                                    取消发布
                                </button>
                            ) : (
                                <button
                                    onClick={handlePublish}
                                    className="px-3 py-1 bg-green-500/20 text-green-400 rounded text-sm hover:bg-green-500/30 flex items-center gap-1"
                                >
                                    <Eye className="w-4 h-4" />
                                    发布
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-6 text-sm text-gray-400">
                    {quiz.time_limit > 0 && (
                        <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            <span>{quiz.time_limit} 分钟</span>
                        </div>
                    )}
                    <div className="flex items-center gap-1">
                        <Trophy className="w-4 h-4" />
                        <span>总分 {quiz.total_points}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span>最多尝试 {quiz.max_attempts} 次</span>
                    </div>
                </div>
            </div>

            {/* Student: Start Quiz Button */}
            {!isTeacher && quiz.is_published && (
                <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 text-center">
                    <button
                        onClick={handleStartQuiz}
                        className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors flex items-center gap-2 mx-auto"
                    >
                        <Play className="w-5 h-5" />
                        开始测验
                    </button>
                    <p className="text-gray-500 text-sm mt-3">
                        开始后将计时，请确保有足够时间完成
                    </p>
                </div>
            )}

            {/* Teacher: Questions List */}
            {isTeacher && (
                <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white">
                            题目列表 ({questions.length})
                        </h2>
                        {!quiz.is_published && (
                            <button
                                onClick={() => setShowAddQuestion(true)}
                                className="flex items-center gap-2 px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                添加题目
                            </button>
                        )}
                    </div>

                    {questions.length === 0 ? (
                        <p className="text-gray-500 text-center py-8">暂无题目，请添加</p>
                    ) : (
                        <div className="space-y-4">
                            {questions.map((q, index) => (
                                <div
                                    key={q.ID}
                                    className="bg-gray-900/50 border border-gray-700 rounded-lg p-4"
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs">
                                                    {getQuestionTypeLabel(q.type)}
                                                </span>
                                                <span className="text-gray-500 text-sm">
                                                    {q.points} 分
                                                </span>
                                            </div>
                                            <p className="text-white mb-2">
                                                {index + 1}. {q.content}
                                            </p>
                                            {'answer' in q && (
                                                <p className="text-green-400 text-sm">
                                                    答案: {q.answer}
                                                </p>
                                            )}
                                        </div>
                                        {!quiz.is_published && (
                                            <button
                                                onClick={() => handleDeleteQuestion(q.ID)}
                                                className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Add Question Modal */}
            {showAddQuestion && quizId && (
                <AddQuestionModal
                    quizId={parseInt(quizId)}
                    onClose={() => setShowAddQuestion(false)}
                    onAdd={(question) => {
                        setQuestions([...questions, question]);
                        setShowAddQuestion(false);
                    }}
                />
            )}
        </div>
    );
}

function QuestionCard({
    question,
    index,
    answer,
    onChange,
    readOnly,
}: {
    question: Question;
    index: number;
    answer: string | string[] | undefined;
    onChange: (value: string | string[]) => void;
    readOnly: boolean;
}) {
    const options = question.options ? JSON.parse(question.options) : [];

    return (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs">
                    {getQuestionTypeLabel(question.type)}
                </span>
                <span className="text-gray-500 text-sm">{question.points} 分</span>
            </div>

            <p className="text-white mb-4">
                <span className="text-gray-400 mr-2">{index + 1}.</span>
                {question.content}
            </p>

            {/* Options */}
            {(question.type === 'single_choice' || question.type === 'multiple_choice') && (
                <div className="space-y-2">
                    {options.map((opt: string, i: number) => {
                        const optionKey = String.fromCharCode(65 + i);
                        const isSelected = question.type === 'multiple_choice'
                            ? (answer as string[] || []).includes(optionKey)
                            : answer === optionKey;

                        return (
                            <label
                                key={i}
                                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${isSelected
                                    ? 'bg-purple-500/20 border border-purple-500/50'
                                    : 'bg-gray-900/50 border border-gray-700 hover:border-gray-600'
                                    }`}
                            >
                                <input
                                    type={question.type === 'multiple_choice' ? 'checkbox' : 'radio'}
                                    name={`q-${question.ID}`}
                                    checked={isSelected}
                                    disabled={readOnly}
                                    onChange={() => {
                                        if (question.type === 'multiple_choice') {
                                            const current = (answer as string[]) || [];
                                            if (isSelected) {
                                                onChange(current.filter(a => a !== optionKey));
                                            } else {
                                                onChange([...current, optionKey]);
                                            }
                                        } else {
                                            onChange(optionKey);
                                        }
                                    }}
                                    className="w-4 h-4 text-purple-600"
                                />
                                <span className="text-gray-300">
                                    <span className="text-gray-500 mr-2">{optionKey}.</span>
                                    {opt}
                                </span>
                            </label>
                        );
                    })}
                </div>
            )}

            {/* True/False */}
            {question.type === 'true_false' && (
                <div className="flex gap-4">
                    {['true', 'false'].map((val) => (
                        <label
                            key={val}
                            className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg cursor-pointer transition-colors ${answer === val
                                ? 'bg-purple-500/20 border border-purple-500/50'
                                : 'bg-gray-900/50 border border-gray-700 hover:border-gray-600'
                                }`}
                        >
                            <input
                                type="radio"
                                name={`q-${question.ID}`}
                                checked={answer === val}
                                disabled={readOnly}
                                onChange={() => onChange(val)}
                                className="w-4 h-4 text-purple-600"
                            />
                            <span className="text-gray-300">
                                {val === 'true' ? '正确' : '错误'}
                            </span>
                        </label>
                    ))}
                </div>
            )}

            {/* Fill Blank */}
            {question.type === 'fill_blank' && (
                <input
                    type="text"
                    value={(answer as string) || ''}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={readOnly}
                    placeholder="输入答案"
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
            )}
        </div>
    );
}

function AddQuestionModal({
    quizId,
    onClose,
    onAdd,
}: {
    quizId: number;
    onClose: () => void;
    onAdd: (question: QuestionWithAnswer) => void;
}) {
    const [type, setType] = useState<'single_choice' | 'multiple_choice' | 'true_false' | 'fill_blank'>('single_choice');
    const [content, setContent] = useState('');
    const [options, setOptions] = useState(['', '', '', '']);
    const [answer, setAnswer] = useState('');
    const [points, setPoints] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!content.trim() || !answer.trim()) return;

        setIsSubmitting(true);
        try {
            const question = await quizApi.addQuestion(quizId, {
                type,
                content,
                options: type === 'single_choice' || type === 'multiple_choice'
                    ? options.filter(o => o.trim())
                    : undefined,
                answer,
                points,
            });
            onAdd(question);
        } catch (err: any) {
            alert('添加失败: ' + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 overflow-y-auto py-8">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg mx-4">
                <h2 className="text-xl font-bold text-white mb-4">添加题目</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Question Type */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">题目类型</label>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { value: 'single_choice', label: '单选题' },
                                { value: 'multiple_choice', label: '多选题' },
                                { value: 'true_false', label: '判断题' },
                                { value: 'fill_blank', label: '填空题' },
                            ].map((t) => (
                                <button
                                    key={t.value}
                                    type="button"
                                    onClick={() => {
                                        setType(t.value as any);
                                        setAnswer('');
                                    }}
                                    className={`py-2 rounded-lg text-sm transition-colors ${type === t.value
                                        ? 'bg-purple-600 text-white'
                                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                        }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Content */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">题目内容 *</label>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 h-24 resize-none"
                            placeholder="输入题目内容"
                            required
                        />
                    </div>

                    {/* Options (for choice questions) */}
                    {(type === 'single_choice' || type === 'multiple_choice') && (
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">选项</label>
                            <div className="space-y-2">
                                {options.map((opt, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <span className="text-gray-500 w-6">{String.fromCharCode(65 + i)}.</span>
                                        <input
                                            type="text"
                                            value={opt}
                                            onChange={(e) => {
                                                const newOptions = [...options];
                                                newOptions[i] = e.target.value;
                                                setOptions(newOptions);
                                            }}
                                            className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                                            placeholder={`选项 ${String.fromCharCode(65 + i)}`}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Answer */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">正确答案 *</label>
                        {type === 'true_false' ? (
                            <div className="flex gap-2">
                                {['true', 'false'].map((val) => (
                                    <button
                                        key={val}
                                        type="button"
                                        onClick={() => setAnswer(val)}
                                        className={`flex-1 py-2 rounded-lg text-sm transition-colors ${answer === val
                                            ? 'bg-purple-600 text-white'
                                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                            }`}
                                    >
                                        {val === 'true' ? '正确' : '错误'}
                                    </button>
                                ))}
                            </div>
                        ) : type === 'multiple_choice' ? (
                            <input
                                type="text"
                                value={answer}
                                onChange={(e) => setAnswer(e.target.value)}
                                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                placeholder='多选用 JSON 格式，如: ["A", "C"]'
                            />
                        ) : (
                            <input
                                type="text"
                                value={answer}
                                onChange={(e) => setAnswer(e.target.value)}
                                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                placeholder={type === 'single_choice' ? '如: A' : '填空题答案'}
                            />
                        )}
                    </div>

                    {/* Points */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">分值</label>
                        <input
                            type="number"
                            value={points}
                            onChange={(e) => setPoints(parseInt(e.target.value) || 1)}
                            min="1"
                            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
                        >
                            取消
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                            添加
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function getQuestionTypeLabel(type: string): string {
    switch (type) {
        case 'single_choice': return '单选';
        case 'multiple_choice': return '多选';
        case 'true_false': return '判断';
        case 'fill_blank': return '填空';
        default: return type;
    }
}
