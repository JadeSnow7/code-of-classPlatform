import { useEffect, useRef, useState } from 'react';
import { Drawer, Space, Tag, Button, Typography } from 'antd';
import { Sparkles } from 'lucide-react';
import { aiStreamClient } from '@/lib/ai-stream';
import type { ChatMessage } from '@/api/ai';

const { Text } = Typography;

interface AICourseDrawerProps {
    open: boolean;
    onClose: () => void;
    isMobile?: boolean;
}

export function AICourseDrawer({ open, onClose, isMobile }: AICourseDrawerProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [aiMessages, setAiMessages] = useState<ChatMessage[]>([
        {
            role: 'assistant',
            content: '你好！我是课程专属云端 AI 助手。此入口需要联网，并会优先返回可追踪来源的解释。',
        },
    ]);
    const [inputValue, setInputValue] = useState('');
    const [streaming, setStreaming] = useState(false);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [aiMessages]);

    const handleAskAI = async () => {
        if (!inputValue.trim() || streaming) return;
        const userMessage = inputValue.trim();
        setInputValue('');
        setStreaming(true);

        const userMsg: ChatMessage = { role: 'user', content: userMessage };
        setAiMessages((prev) => [...prev, userMsg, { role: 'assistant', content: '' }]);

        let assistantText = '';
        const history = [...aiMessages, userMsg];

        try {
            await aiStreamClient.streamChat(history, {
                mode: 'tutor_rag',
                onMessage: (token) => {
                    assistantText += token;
                    setAiMessages((prev) => {
                        const updated = [...prev];
                        updated[updated.length - 1] = { role: 'assistant', content: assistantText };
                        return updated;
                    });
                },
                onError: () => {
                    setAiMessages((prev) => {
                        const updated = [...prev];
                        updated[updated.length - 1] = {
                            role: 'assistant',
                            content: '云端 AI 暂时不可用，请稍后重试。',
                        };
                        return updated;
                    });
                },
                onFinish: () => undefined,
            });
        } finally {
            setStreaming(false);
        }
    };

    return (
        <Drawer
            title={
                isMobile ? (
                    'AI 课程答疑'
                ) : (
                    <Space>
                        <Sparkles size={18} color="var(--primary-500)" />
                        <span>课程专属答疑助手</span>
                        <Tag color="blue">云端 AI</Tag>
                    </Space>
                )
            }
            placement={isMobile ? 'bottom' : 'right'}
            width={isMobile ? undefined : 400}
            height={isMobile ? '70%' : undefined}
            open={open}
            onClose={onClose}
            styles={{
                body: {
                    backgroundColor: isMobile ? 'var(--surface-50)' : 'var(--surface-950)',
                    padding: 0,
                },
                header: isMobile
                    ? undefined
                    : {
                          backgroundColor: 'var(--surface-800)',
                          borderBottom: '1px solid var(--surface-700)',
                          color: 'var(--text-dark)',
                      },
            }}
        >
            <div className="flex flex-col h-full">
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {aiMessages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div
                                className="max-w-[85%] rounded-2xl p-3"
                                style={{
                                    backgroundColor:
                                        msg.role === 'user'
                                            ? 'var(--primary-700)'
                                            : isMobile
                                              ? 'white'
                                              : 'var(--surface-800)',
                                    color:
                                        msg.role === 'user'
                                            ? 'white'
                                            : isMobile
                                              ? 'var(--text-light)'
                                              : 'var(--text-dark)',
                                }}
                            >
                                <Text style={{ color: 'inherit', whiteSpace: 'pre-wrap' }}>{msg.content}</Text>
                            </div>
                        </div>
                    ))}
                    {streaming && (
                        <div className="flex justify-start">
                            <div
                                className="px-4 py-2 rounded-xl flex gap-1"
                                style={{ backgroundColor: isMobile ? 'var(--surface-100)' : 'var(--surface-800)' }}
                            >
                                {[0, 1, 2].map((i) => (
                                    <div
                                        key={i}
                                        className="w-2 h-2 rounded-full animate-bounce"
                                        style={{ backgroundColor: 'var(--primary-500)', animationDelay: `${i * 150}ms` }}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div
                    className={isMobile ? 'p-4 bg-white border-t flex gap-2' : 'p-4 border-t flex gap-2'}
                    style={!isMobile ? { borderColor: 'var(--surface-700)', backgroundColor: 'var(--surface-800)' } : undefined}
                >
                    <input
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAskAI()}
                        placeholder="向云端 AI 提问..."
                        className={`flex-1 px-3 py-2 outline-none text-sm ${isMobile ? 'rounded-full' : 'rounded-lg'}`}
                        style={{
                            backgroundColor: isMobile ? 'var(--surface-100)' : 'var(--surface-700)',
                            color: isMobile ? 'var(--text-light)' : 'var(--text-dark)',
                        }}
                    />
                    {isMobile ? (
                        <Button type="primary" shape="circle" loading={streaming} onClick={handleAskAI} disabled={!inputValue.trim()} />
                    ) : (
                        <Button type="primary" loading={streaming} onClick={handleAskAI} disabled={!inputValue.trim()}>
                            发送
                        </Button>
                    )}
                </div>
            </div>
        </Drawer>
    );
}
