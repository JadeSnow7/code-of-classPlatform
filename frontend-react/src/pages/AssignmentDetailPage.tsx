import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, User, FileText, Send, CheckCircle, Loader2, Star, Upload, X } from 'lucide-react';
import { assignmentApi, type Assignment, type Submission } from '@/api/assignment';
import { uploadApi } from '@/api/upload';
import { authStore } from '@/lib/auth-store';

export function AssignmentDetailPage() {
    const { courseId, assignmentId } = useParams<{ courseId: string; assignmentId: string }>();
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [mySubmission, setMySubmission] = useState<Submission | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Form states
    const [content, setContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // File upload states
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const user = authStore.getUser();
    const isTeacher = user?.role === 'admin' || user?.role === 'teacher' || user?.role === 'assistant';
    const isStudent = user?.role === 'student';

    useEffect(() => {
        if (!assignmentId) return;
        loadData();
    }, [assignmentId]);

    const loadData = async () => {
        if (!assignmentId) return;
        setIsLoading(true);
        setError(null);
        try {
            const assignmentData = await assignmentApi.get(parseInt(assignmentId));
            setAssignment(assignmentData);

            if (isTeacher) {
                const subs = await assignmentApi.listSubmissions(parseInt(assignmentId));
                setSubmissions(subs);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load assignment');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async () => {
        if (!assignmentId || !content.trim()) return;
        setIsSubmitting(true);
        setUploadError(null);

        try {
            let fileUrl = '';

            // Upload file if selected
            if (selectedFile) {
                setUploadProgress(0);
                const uploadResult = await uploadApi.uploadAssignmentFile(
                    parseInt(assignmentId),
                    selectedFile,
                    (progress) => setUploadProgress(progress)
                );
                fileUrl = uploadResult.signed_url;
            }

            // Submit assignment with content and optional file
            const sub = await assignmentApi.submit(parseInt(assignmentId), {
                content,
                file_url: fileUrl || undefined
            });

            setMySubmission(sub);
            setContent('');
            setSelectedFile(null);
            setUploadProgress(0);
            alert('提交成功!');
        } catch (err: any) {
            setUploadError(err.message || '提交失败');
            alert('提交失败: ' + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleGrade = async (submissionId: number, grade: number, feedback: string) => {
        try {
            await assignmentApi.grade(submissionId, { grade, feedback });
            loadData();
        } catch (err: any) {
            alert('评分失败: ' + err.message);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (error || !assignment) {
        return (
            <div className="p-6">
                <div className="bg-red-500/20 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg">
                    {error || '作业不存在'}
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-4xl">
            {/* Back Link */}
            <Link
                to={`/courses/${courseId}/assignments`}
                className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                返回作业列表
            </Link>

            {/* Assignment Header */}
            <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-2xl p-6 border border-blue-500/20 mb-6">
                <h1 className="text-2xl font-bold text-white mb-2">{assignment.title}</h1>
                <p className="text-gray-300 mb-4">{assignment.description || '暂无描述'}</p>
                <div className="flex items-center gap-6 text-sm text-gray-400">
                    <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        <span>
                            截止: {assignment.deadline
                                ? new Date(assignment.deadline).toLocaleDateString('zh-CN')
                                : '无截止日期'}
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <User className="w-4 h-4" />
                        <span>教师 #{assignment.teacher_id}</span>
                    </div>
                </div>
            </div>

            {/* Student: Submit Form */}
            {isStudent && (
                <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <Send className="w-5 h-5" />
                        提交作业
                    </h2>
                    {mySubmission ? (
                        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                            <div className="flex items-center gap-2 text-green-400 mb-2">
                                <CheckCircle className="w-5 h-5" />
                                <span className="font-medium">已提交</span>
                            </div>
                            <p className="text-gray-300 text-sm">{mySubmission.content}</p>
                            {mySubmission.grade !== null && (
                                <div className="mt-3 pt-3 border-t border-gray-700">
                                    <div className="flex items-center gap-2 text-yellow-400">
                                        <Star className="w-4 h-4" />
                                        <span>成绩: {mySubmission.grade} 分</span>
                                    </div>
                                    {mySubmission.feedback && (
                                        <p className="text-gray-400 text-sm mt-1">反馈: {mySubmission.feedback}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="输入你的作业内容..."
                                className="w-full h-32 px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                            />

                            {/* File Upload Area */}
                            <div className="space-y-2">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".pdf,.doc,.docx,.txt,.zip"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            // Validate file size (20MB max)
                                            if (file.size > 20 * 1024 * 1024) {
                                                setUploadError('文件大小不能超过 20MB');
                                                e.target.value = '';
                                                return;
                                            }
                                            setSelectedFile(file);
                                            setUploadError(null);
                                        }
                                    }}
                                    className="hidden"
                                />

                                {!selectedFile ? (
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors text-sm"
                                    >
                                        <Upload className="w-4 h-4" />
                                        选择文件 (可选)
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-2 p-3 bg-gray-700/50 border border-gray-600 rounded-lg">
                                        <FileText className="w-4 h-4 text-blue-400" />
                                        <span className="text-sm text-gray-300 flex-1 truncate">
                                            {selectedFile.name}
                                        </span>
                                        <span className="text-xs text-gray-500">
                                            {(selectedFile.size / 1024).toFixed(1)} KB
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedFile(null);
                                                if (fileInputRef.current) fileInputRef.current.value = '';
                                            }}
                                            className="p-1 hover:bg-gray-600 rounded transition-colors"
                                        >
                                            <X className="w-4 h-4 text-gray-400" />
                                        </button>
                                    </div>
                                )}

                                {/* Upload Progress */}
                                {uploadProgress > 0 && uploadProgress < 100 && (
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs text-gray-400">
                                            <span>上传中...</span>
                                            <span>{uploadProgress}%</span>
                                        </div>
                                        <div className="w-full bg-gray-700 rounded-full h-2">
                                            <div
                                                className="bg-blue-500 h-2 rounded-full transition-all"
                                                style={{ width: `${uploadProgress}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Upload Error */}
                                {uploadError && (
                                    <p className="text-red-400 text-sm">{uploadError}</p>
                                )}
                            </div>

                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting || (!content.trim() && !selectedFile)}
                                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
                            >
                                {isSubmitting ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Send className="w-4 h-4" />
                                )}
                                提交
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Teacher: Submissions List */}
            {isTeacher && (
                <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                    <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        学生提交 ({submissions.length})
                    </h2>
                    {submissions.length === 0 ? (
                        <p className="text-gray-500 text-center py-8">暂无提交</p>
                    ) : (
                        <div className="space-y-4">
                            {submissions.map((sub) => (
                                <SubmissionCard
                                    key={sub.ID}
                                    submission={sub}
                                    onGrade={handleGrade}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function SubmissionCard({
    submission,
    onGrade,
}: {
    submission: Submission;
    onGrade: (id: number, grade: number, feedback: string) => void;
}) {
    const [showGrade, setShowGrade] = useState(false);
    const [grade, setGrade] = useState(submission.grade?.toString() || '');
    const [feedback, setFeedback] = useState(submission.feedback || '');
    const [isAIGrading, setIsAIGrading] = useState(false);
    const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);

    const handleSubmitGrade = () => {
        const gradeNum = parseInt(grade);
        if (isNaN(gradeNum) || gradeNum < 0 || gradeNum > 100) {
            alert('请输入 0-100 之间的分数');
            return;
        }
        onGrade(submission.ID, gradeNum, feedback);
        setShowGrade(false);
    };

    const handleAIGrade = async () => {
        setIsAIGrading(true);
        setAiSuggestion(null);
        try {
            const result = await assignmentApi.aiGrade(submission.ID);
            setAiSuggestion(result.suggestion);
        } catch (err: any) {
            alert('AI 评分失败: ' + (err.message || '服务不可用'));
        } finally {
            setIsAIGrading(false);
        }
    };

    return (
        <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
            <div className="flex items-start justify-between mb-3">
                <div>
                    <span className="text-gray-400 text-sm">学生 #{submission.student_id}</span>
                    <span className="text-gray-600 mx-2">•</span>
                    <span className="text-gray-500 text-sm">
                        {new Date(submission.CreatedAt).toLocaleString('zh-CN')}
                    </span>
                </div>
                {submission.grade !== null ? (
                    <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-sm">
                        {submission.grade} 分
                    </span>
                ) : (
                    <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-sm">
                        待评分
                    </span>
                )}
            </div>

            <p className="text-gray-300 text-sm mb-3">{submission.content}</p>

            {/* File attachment display */}
            {submission.file_url && (
                <div className="mb-3">
                    <a
                        href={submission.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm"
                    >
                        <FileText className="w-4 h-4" />
                        查看附件
                    </a>
                </div>
            )}

            {/* AI Suggestion Display */}
            {aiSuggestion && (
                <div className="mb-3 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                    <div className="flex items-center gap-2 text-purple-400 text-sm font-medium mb-2">
                        <Star className="w-4 h-4" />
                        AI 评分建议
                    </div>
                    <p className="text-gray-300 text-sm whitespace-pre-wrap">{aiSuggestion}</p>
                </div>
            )}

            {!showGrade ? (
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowGrade(true)}
                        className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
                    >
                        {submission.grade !== null ? '修改评分' : '评分'}
                    </button>
                    <button
                        onClick={handleAIGrade}
                        disabled={isAIGrading}
                        className="text-purple-400 hover:text-purple-300 text-sm transition-colors disabled:opacity-50 flex items-center gap-1"
                    >
                        {isAIGrading ? (
                            <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                分析中...
                            </>
                        ) : (
                            'AI 辅助评分'
                        )}
                    </button>
                </div>
            ) : (
                <div className="bg-gray-800 rounded-lg p-3 space-y-3">
                    <div className="flex gap-3">
                        <input
                            type="number"
                            min="0"
                            max="100"
                            value={grade}
                            onChange={(e) => setGrade(e.target.value)}
                            placeholder="分数 (0-100)"
                            className="w-24 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <input
                            type="text"
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            placeholder="评语 (可选)"
                            className="flex-1 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleSubmitGrade}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
                        >
                            确认
                        </button>
                        <button
                            onClick={() => setShowGrade(false)}
                            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded transition-colors"
                        >
                            取消
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
