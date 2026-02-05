/**
 * Writing Submission Page
 * 
 * Allows students to submit writing samples for AI analysis.
 * Supports different writing types: literature review, course paper, thesis, abstract.
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    submitWriting,
    getWritingSubmissions,
    getWritingTypeName,
    parseFeedback,
    type WritingSubmission,
    type WritingType,
    WRITING_TYPE_INFO,
} from '../lib/student-api';
import { WritingPolishPanel } from '@/components/writing/WritingPolishPanel';
import { logger } from '@/lib/logger';
import './WritingPage.css';

export default function WritingPage() {
    const { courseId } = useParams<{ courseId: string }>();
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState<'submit' | 'history' | 'polish'>('submit');
    const [submissions, setSubmissions] = useState<WritingSubmission[]>([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Form state
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [writingType, setWritingType] = useState<WritingType>('course_paper');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Computed word count
    const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

    // Load submissions when switching to history tab
    const loadSubmissions = async () => {
        if (!courseId) return;
        setLoading(true);
        try {
            const data = await getWritingSubmissions(parseInt(courseId));
            setSubmissions(data);
        } catch (err) {
            logger.error('failed to load submissions', { error: err, courseId });
        } finally {
            setLoading(false);
        }
    };

    const handleTabChange = (tab: 'submit' | 'history' | 'polish') => {
        setActiveTab(tab);
        if (tab === 'history') {
            loadSubmissions();
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!courseId) return;

        if (!title.trim()) {
            setError('请输入标题');
            return;
        }
        if (!content.trim()) {
            setError('请输入写作内容');
            return;
        }
        if (wordCount < 50) {
            setError('内容至少需要50个单词');
            return;
        }

        setSubmitting(true);
        setError('');
        setSuccess('');

        try {
            await submitWriting(parseInt(courseId), {
                title: title.trim(),
                content: content.trim(),
                writing_type: writingType,
            });
            setSuccess('提交成功！AI正在分析您的写作...');
            setTitle('');
            setContent('');
            // Switch to history tab after short delay
            setTimeout(() => {
                handleTabChange('history');
            }, 1500);
        } catch (err) {
            setError('提交失败，请重试');
            logger.error('writing submit failed', { error: err, courseId, writingType });
        } finally {
            setSubmitting(false);
        }
    };

    const viewSubmission = (id: number) => {
        navigate(`/courses/${courseId}/writing/${id}`);
    };

    return (
        <div className="writing-page">
            <div className="page-header">
                <h1>学术写作提交</h1>
                <p className="subtitle">提交您的写作样本，获取AI智能反馈与改进建议</p>
            </div>

            {/* Tab Navigation */}
            <div className="tab-nav">
                <button
                    className={`tab-btn ${activeTab === 'submit' ? 'active' : ''}`}
                    onClick={() => handleTabChange('submit')}
                >
                    📝 提交写作
                </button>
                <button
                    className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
                    onClick={() => handleTabChange('history')}
                >
                    📋 历史记录
                </button>
                <button
                    className={`tab-btn ${activeTab === 'polish' ? 'active' : ''}`}
                    onClick={() => handleTabChange('polish')}
                >
                    ✨ 润色助手
                </button>
            </div>

            {/* Submit Tab */}
            {activeTab === 'submit' && (
                <form className="submit-form" onSubmit={handleSubmit}>
                    {error && <div className="alert alert-error">{error}</div>}
                    {success && <div className="alert alert-success">{success}</div>}

                    {/* Writing Type Selection */}
                    <div className="form-group">
                        <label>写作类型</label>
                        <div className="writing-type-grid">
                            {(Object.keys(WRITING_TYPE_INFO) as WritingType[]).map((type) => (
                                <button
                                    key={type}
                                    type="button"
                                    className={`type-card ${writingType === type ? 'selected' : ''}`}
                                    onClick={() => setWritingType(type)}
                                >
                                    <span className="type-name">{WRITING_TYPE_INFO[type].name}</span>
                                    <span className="type-desc">{WRITING_TYPE_INFO[type].description}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Title Input */}
                    <div className="form-group">
                        <label htmlFor="title">标题</label>
                        <input
                            id="title"
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="请输入写作标题"
                            maxLength={256}
                        />
                    </div>

                    {/* Content Textarea */}
                    <div className="form-group">
                        <label htmlFor="content">
                            写作内容
                            <span className="word-count">{wordCount} 词</span>
                        </label>
                        <textarea
                            id="content"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="请粘贴或输入您的英文写作内容..."
                            rows={15}
                        />
                    </div>

                    {/* Submit Button */}
                    <button
                        type="submit"
                        className="submit-btn"
                        disabled={submitting}
                    >
                        {submitting ? '提交中...' : '提交分析'}
                    </button>
                </form>
            )}

            {/* History Tab */}
            {activeTab === 'history' && (
                <div className="history-section">
                    {loading ? (
                        <div className="loading">加载中...</div>
                    ) : submissions.length === 0 ? (
                        <div className="empty-state">
                            <p>暂无提交记录</p>
                            <button onClick={() => handleTabChange('submit')}>
                                开始提交
                            </button>
                        </div>
                    ) : (
                        <div className="submissions-list">
                            {submissions.map((sub) => {
                                const feedback = parseFeedback(sub);
                                return (
                                    <div
                                        key={sub.id}
                                        className="submission-card"
                                        onClick={() => viewSubmission(sub.id)}
                                    >
                                        <div className="card-header">
                                            <span className="type-badge">
                                                {getWritingTypeName(sub.writing_type)}
                                            </span>
                                            <span className="date">
                                                {new Date(sub.created_at).toLocaleDateString('zh-CN')}
                                            </span>
                                        </div>
                                        <h3 className="card-title">{sub.title}</h3>
                                        <div className="card-meta">
                                            <span>{sub.word_count} 词</span>
                                            {feedback && (
                                                <span className="score">
                                                    评分: {feedback.overall_score}/10
                                                </span>
                                            )}
                                        </div>
                                        {feedback ? (
                                            <div className="feedback-preview">
                                                ✅ 已完成分析
                                            </div>
                                        ) : (
                                            <div className="feedback-preview pending">
                                                ⏳ 分析中...
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Polish Tab */}
            {activeTab === 'polish' && (
                <div className="polish-tab-container" style={{ padding: '0 20px 20px' }}>
                    <WritingPolishPanel />
                </div>
            )}
        </div>
    );
}
