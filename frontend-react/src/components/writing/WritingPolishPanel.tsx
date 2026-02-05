import { useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Send, Copy, RefreshCw, ArrowRight } from 'lucide-react';
import { logger } from '@/lib/logger';
import './WritingPolishPanel.css';

/**
 * Result payload for writing polish responses.
 */
interface PolishResult {
    /** Original input text. */
    original: string;
    /** Polished version of the text. */
    polished: string;
    /** List of granular changes made by the model. */
    changes: Array<{
        /** Change category such as grammar/style/clarity. */
        type: string;
        /** Original fragment extracted from input. */
        original_fragment: string;
        /** Revised fragment suggested by the model. */
        revised_fragment: string;
        /** Reason for the change. */
        reason: string;
    }>;
    /** Overall guidance or summary comment. */
    overall_comment: string;
}

/**
 * Props for WritingPolishPanel.
 */
interface WritingPolishPanelProps {
    /** Initial text shown in the input box. */
    initialInput?: string;
    /** Initial polish result to render. */
    initialResult?: PolishResult | null;
    /** Whether to start in a loading state. */
    initialLoading?: boolean;
    /** Initial error message to display. */
    initialError?: string;
}

/**
 * Provides an AI-powered writing polish workflow for short passages.
 *
 * @param props Component props.
 * @returns The writing polish panel UI.
 */
export function WritingPolishPanel({
    initialInput = '',
    initialResult = null,
    initialLoading = false,
    initialError = '',
}: WritingPolishPanelProps) {
    const [input, setInput] = useState(initialInput);
    const [result, setResult] = useState<PolishResult | null>(initialResult);
    const [loading, setLoading] = useState(initialLoading);
    const [error, setError] = useState(initialError);

    const handlePolish = async () => {
        if (!input.trim()) return;

        setLoading(true);
        setError('');
        setResult(null);

        try {
            const response = await apiClient.post<{ reply: string }>('/ai/chat', {
                messages: [
                    { role: 'user', content: input }
                ],
                mode: 'polish',
                stream: false
            });

            const replyText = response.reply;
            // Clean up Markdown code blocks if present
            const cleanJson = replyText.replace(/```json\n?|\n?```/g, '').trim();

            try {
                const parsed = JSON.parse(cleanJson);
                setResult(parsed);
            } catch (e) {
                logger.error('failed to parse polish response', { error: e });
                setError('AI返回格式解析失败，请重试');
            }
        } catch (err) {
            logger.error('polish request failed', { error: err });
            setError('请求失败，请稍后重试');
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    return (
        <div className="writing-polish-panel">
            <div className="panel-header">
                <h3>✨ 智能润色</h3>
                <p>优化学术语气、修正语法错误</p>
            </div>

            <div className="panel-content">
                <div className="input-section">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="在此粘贴需要润色的英文段落..."
                        rows={6}
                        disabled={loading}
                    />
                    <div className="actions">
                        <span className="word-count">{input.length} 字符</span>
                        <button
                            className="polish-btn"
                            onClick={handlePolish}
                            disabled={loading || !input.trim()}
                        >
                            {loading ? <RefreshCw className="spin" size={16} /> : <Send size={16} />}
                            {loading ? '润色中...' : '开始润色'}
                        </button>
                    </div>
                </div>

                {error && <div className="error-message">{error}</div>}

                {result && (
                    <div className="result-section">
                        <div className="polished-text-card">
                            <div className="card-header">
                                <span>润色结果</span>
                                <button onClick={() => copyToClipboard(result.polished)} title="复制">
                                    <Copy size={16} />
                                </button>
                            </div>
                            <div className="polished-content">
                                {result.polished}
                            </div>
                        </div>

                        {result.overall_comment && (
                            <div className="comment-box">
                                💡 <strong>建议：</strong> {result.overall_comment}
                            </div>
                        )}

                        <div className="changes-list">
                            <h4>修改详情</h4>
                            {result.changes.length === 0 ? (
                                <p className="no-changes">没有发现重大修改建议，写得不错！</p>
                            ) : (
                                result.changes.map((change, idx) => (
                                    <div key={idx} className="change-item">
                                        <div className="change-content">
                                            <span className="original">{change.original_fragment}</span>
                                            <ArrowRight size={14} className="arrow" />
                                            <span className="revised">{change.revised_fragment}</span>
                                        </div>
                                        <div className="change-reason">
                                            <span className="type-tag">{change.type}</span>
                                            {change.reason}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
