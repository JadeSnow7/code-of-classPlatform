import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getWritingSubmission, type WritingSubmission, getWritingTypeName } from '@/lib/student-api';
import { logger } from '@/lib/logger';
import './WritingPage.css'; // Reuse existing styles

export default function WritingDetailPage() {
    const { submissionId } = useParams<{ courseId: string; submissionId: string }>();
    const navigate = useNavigate();

    const [submission, setSubmission] = useState<WritingSubmission | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!submissionId) return;

        const load = async () => {
            try {
                const data = await getWritingSubmission(parseInt(submissionId));
                setSubmission(data);
            } catch (err) {
                logger.error('failed to load submission', { error: err, submissionId });
                setError('加载失败');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [submissionId]);

    if (loading) return <div className="loading">加载中...</div>;
    if (error || !submission) return <div className="alert alert-error">{error || '未找到提交记录'}</div>;

    const feedback = submission.feedback;

    return (
        <div className="writing-page detail-view">
            <div className="page-header">
                <button onClick={() => navigate(-1)} className="back-btn">← 返回</button>
                <h1>{submission.title}</h1>
                <div className="meta-info">
                    <span className="type-badge">{getWritingTypeName(submission.writingType)}</span>
                    • {submission.createdAt ? new Date(submission.createdAt).toLocaleString('zh-CN') : ''}
                    • {submission.wordCount} 词
                </div>
            </div>

            <div className="detail-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                {/* Content Column */}
                <div className="content-card" style={{ background: '#1e1e2e', padding: '20px', borderRadius: '12px', border: '1px solid #303040' }}>
                    <h3>原文内容</h3>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', color: '#ccc' }}>
                        {submission.content}
                    </div>
                </div>

                {/* Feedback Column */}
                <div className="feedback-card" style={{ background: '#1e1e2e', padding: '20px', borderRadius: '12px', border: '1px solid #303040' }}>
                    <h3>AI 评估报告</h3>
                    {feedback ? (
                        <div className="feedback-content">
                            <div className="overall-score" style={{ fontSize: '2rem', fontWeight: 'bold', color: '#4f46e5', marginBottom: '16px' }}>
                                {feedback.overallScore} <span style={{ fontSize: '1rem', color: '#666' }}>/ 10</span>
                            </div>

                            <div className="dimensions-list">
                                {feedback.dimensions?.map((dim) => (
                                    <div key={dim.key || dim.label} className="dim-item" style={{ marginBottom: '12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <span>{dim.label}</span>
                                            <span style={{ color: '#818cf8' }}>{dim.score}</span>
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: '#888' }}>{dim.comment}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="feedback-section" style={{ marginTop: '20px' }}>
                                <h4 style={{ color: '#f87171' }}>🔧 改进建议</h4>
                                <ul style={{ paddingLeft: '20px' }}>
                                    {feedback.dimensions?.flatMap(d => d.suggestions ?? []).map((s, i) => <li key={i}>{s}</li>)}
                                </ul>
                            </div>

                            <div className="feedback-section" style={{ marginTop: '20px', background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px' }}>
                                <h4>💡 总结</h4>
                                <p>{feedback.summary}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="pending-state">
                            AI 分析正在进行中，请稍候查看...
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
