import { useState, useRef, useEffect, type FormEvent } from 'react';
import { useChatStore } from '@/domains/chat/useChatStore';
import { Send, Square, Bot, User, Plus, Trash2, MessageSquare } from 'lucide-react';
import { Layout, Button, Input, Typography, Avatar, Space, Drawer } from 'antd';
import { clsx } from 'clsx';
import { Link, useParams } from 'react-router-dom';

const MULTI_AGENT_ENABLED = import.meta.env.VITE_MULTI_AGENT_EXPERIMENTAL === 'true';

const { Sider, Content, Header } = Layout;
const { Title, Text, Paragraph } = Typography;

export function ChatPage() {
    const { courseId } = useParams();
    const {
        status,
        error,
        conversations,
        currentConversationId,
        getMessages,
        sendMessage,
        stop,
        newConversation,
        selectConversation,
        deleteConversation,
    } = useChatStore();

    const messages = getMessages();
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!input.trim() || status === 'streaming') return;
        sendMessage(input.trim(), courseId);
        setInput('');
    };

    const isStreaming = status === 'streaming';

    const renderSidebarContent = () => (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 16, borderBottom: '1px solid #1E1F2E' }}>
                <Button
                    type="primary"
                    block
                    icon={<Plus size={16} />}
                    onClick={() => {
                        newConversation();
                        setIsSidebarOpen(false);
                    }}
                    style={{ backgroundColor: '#2563EB', height: 40, borderRadius: 8 }}
                >
                    新对话
                </Button>
            </div>
<<<<<<< HEAD:frontend/src/pages/ChatPage.tsx

            {/* Mobile Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-30 md:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* History Sidebar */}
            <div className={clsx(
                "fixed inset-y-0 left-0 z-40 w-64 bg-gray-900 border-r border-gray-800 flex flex-col transition-transform duration-300 md:translate-x-0 md:static",
                isSidebarOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <div className="p-4 border-b border-gray-800">
                    <button
                        onClick={() => {
                            newConversation();
                            setIsSidebarOpen(false);
                        }}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm font-medium"
                    >
                        <Plus className="w-4 h-4" />
                        新对话
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                    {conversations.length === 0 ? (
                        <div className="text-center text-gray-500 text-sm py-8">
                            暂无历史记录
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {conversations.map((conv) => (
                                <div
                                    key={conv.id}
                                    className={clsx(
                                        'group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors',
                                        conv.id === currentConversationId
                                            ? 'bg-blue-600/20 text-blue-300'
                                            : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                    )}
                                    onClick={() => {
                                        selectConversation(conv.id);
                                        setIsSidebarOpen(false);
                                    }}
                                >
                                    <MessageSquare className="w-4 h-4 flex-shrink-0" />
                                    <span className="flex-1 text-sm truncate">{conv.title}</span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deleteConversation(conv.id);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded transition-all"
                                    >
                                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col">
                {/* Header */}
                <header className="px-6 py-4 border-b border-gray-700/50 bg-gray-900/50 backdrop-blur-sm">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h1 className="text-xl font-semibold text-white flex items-center gap-2">
                                <Bot className="w-6 h-6 text-blue-400" />
                                AI 智能答疑
                            </h1>
                            <p className="text-sm text-gray-400 mt-1">
                                向 AI 助手提问课程相关问题
                            </p>
                        </div>
                        {MULTI_AGENT_ENABLED && (
                            <Link
                                to={`/courses/${courseId}/chat/experimental`}
                                className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/20"
                            >
                                打开 Multi-Agent 实验版
                            </Link>
                        )}
                    </div>
                </header>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {messages.length === 0 && (
                        <div className="text-center text-gray-500 py-12">
                            <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>开始提问吧！例如：&quot;请总结这章的关键知识点&quot;</p>
                        </div>
                    )}

                    {messages.map((msg, idx) => (
                        <div
                            key={idx}
                            className={clsx(
                                'flex gap-3',
                                msg.role === 'user' ? 'justify-end' : 'justify-start'
                            )}
                        >
                            {msg.role === 'assistant' && (
                                <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                                    <Bot className="w-4 h-4 text-blue-400" />
                                </div>
                            )}
                            <div
                                className={clsx(
                                    'max-w-[70%] px-4 py-3 rounded-2xl',
                                    msg.role === 'user'
                                        ? 'bg-blue-600 text-white rounded-br-md'
                                        : 'bg-gray-800 text-gray-100 rounded-bl-md border border-gray-700'
                                )}
                            >
                                <p className="whitespace-pre-wrap">
                                    {msg.content}
                                    {msg.role === 'assistant' && isStreaming && idx === messages.length - 1 && (
                                        <span className="inline-block w-2 h-4 bg-blue-400 ml-1 animate-pulse" />
                                    )}
                                </p>
                            </div>
                            {msg.role === 'user' && (
                                <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center flex-shrink-0">
                                    <User className="w-4 h-4 text-gray-300" />
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Thinking indicator when AI hasn't responded yet */}
                    {isStreaming && (messages.length === 0 || messages[messages.length - 1]?.role === 'user') && (
                        <div className="flex gap-3 justify-start">
                            <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                                <Bot className="w-4 h-4 text-blue-400" />
                            </div>
                            <div className="px-4 py-3 rounded-2xl bg-gray-800 text-gray-400 rounded-bl-md border border-gray-700 flex items-center gap-2">
                                <div className="flex gap-1">
                                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                                <span className="text-sm">AI 正在思考...</span>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="flex items-center gap-2 text-red-400 text-sm">
                            <span>出错了: {error}</span>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <form
                    onSubmit={handleSubmit}
                    className="p-4 border-t border-gray-700/50 bg-gray-900/50 backdrop-blur-sm"
                >
                    <div className="flex gap-3">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="输入你的问题..."
                            className="flex-1 px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                            disabled={isStreaming}
                        />
                        {isStreaming ? (
                            <button
                                type="button"
                                onClick={stop}
                                className="px-4 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium transition-all flex items-center gap-2"
                            >
                                <Square className="w-5 h-5" />
                                停止
                            </button>
                        ) : (
                            <button
                                type="submit"
                                disabled={!input.trim()}
                                className="px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <Send className="w-5 h-5" />
                                发送
                            </button>
                        )}
=======
            <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                {conversations.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#6B7280', padding: '32px 0', fontSize: 14 }}>
                        暂无历史记录
>>>>>>> origin/main:frontend-react/src/pages/ChatPage.tsx
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {conversations.map((conv) => (
                            <div
                                key={conv.id}
                                className={clsx(
                                    'group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors'
                                )}
                                style={{
                                    backgroundColor: conv.id === currentConversationId ? 'rgba(37, 99, 235, 0.2)' : 'transparent',
                                    color: conv.id === currentConversationId ? '#93C5FD' : '#9CA3AF',
                                }}
                                onClick={() => {
                                    selectConversation(conv.id);
                                    setIsSidebarOpen(false);
                                }}
                            >
                                <Space style={{ overflow: 'hidden', flex: 1 }}>
                                    <MessageSquare size={16} />
                                    <Text
                                        ellipsis
                                        style={{
                                            color: conv.id === currentConversationId ? '#93C5FD' : '#9CA3AF',
                                            fontSize: 14,
                                            margin: 0
                                        }}
                                    >
                                        {conv.title}
                                    </Text>
                                </Space>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        deleteConversation(conv.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded transition-all"
                                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    <Trash2 size={14} className="text-red-400" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <Layout style={{ height: '100vh', background: '#0D0E15' }}>
            {/* Desktop Sidebar */}
            <Sider
                width={260}
                style={{ background: '#111827', borderRight: '1px solid #1F2937' }}
                breakpoint="md"
                collapsedWidth="0"
                trigger={null}
                className="hidden md:block" // Utilizing tailwind for responsive display logic
            >
                {renderSidebarContent()}
            </Sider>

            {/* Mobile Drawer */}
            <Drawer
                placement="left"
                closable={false}
                onClose={() => setIsSidebarOpen(false)}
                open={isSidebarOpen}
                bodyStyle={{ padding: 0, background: '#111827' }}
                width={260}
            >
                {renderSidebarContent()}
            </Drawer>

            <Layout style={{ background: 'transparent' }}>
                {/* Mobile Header */}
                <Header
                    className="md:hidden"
                    style={{
                        background: '#111827',
                        padding: '0 16px',
                        borderBottom: '1px solid #1F2937',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        height: 56,
                        lineHeight: 'normal'
                    }}
                >
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        style={{ border: 'none', background: 'transparent', color: '#9CA3AF', cursor: 'pointer', padding: 8 }}
                    >
                        <MessageSquare size={24} />
                    </button>
                    <Title level={5} style={{ color: '#F3F4F6', margin: 0 }}>AI 智能答疑</Title>
                    <div style={{ width: 40 }} /> {/* Spacer */}
                </Header>

                {/* Main Content Area */}
                <Header className="hidden md:flex" style={{
                    background: 'rgba(17, 24, 39, 0.5)',
                    padding: '0 24px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    backdropFilter: 'blur(8px)',
                    alignItems: 'center',
                    height: 72,
                    lineHeight: 'normal'
                }}>
                    <Space size="middle">
                        <Bot size={28} color="#60A5FA" />
                        <div>
                            <Title level={4} style={{ color: '#F3F4F6', margin: 0 }}>AI 智能答疑</Title>
                            <Text style={{ color: '#9CA3AF', fontSize: 13 }}>向 AI 助手提问有关电磁学的问题</Text>
                        </div>
                    </Space>
                </Header>

                <Content style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                    {/* Messages */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                        {messages.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '64px 0', color: '#6B7280' }}>
                                <Bot size={48} style={{ opacity: 0.5, marginBottom: 16 }} />
                                <Paragraph style={{ color: '#6B7280' }}>开始提问吧！例如："请解释高斯定律"</Paragraph>
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 800, margin: '0 auto' }}>
                            {messages.map((msg, idx) => (
                                <div
                                    key={idx}
                                    style={{
                                        display: 'flex',
                                        gap: 16,
                                        justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                                    }}
                                >
                                    {msg.role === 'assistant' && (
                                        <Avatar
                                            size={36}
                                            icon={<Bot size={20} />}
                                            style={{ backgroundColor: 'rgba(37, 99, 235, 0.2)', color: '#60A5FA', flexShrink: 0 }}
                                        />
                                    )}
                                    <div
                                        style={{
                                            maxWidth: '75%',
                                            padding: '12px 16px',
                                            borderRadius: 16,
                                            borderTopLeftRadius: msg.role === 'assistant' ? 4 : 16,
                                            borderTopRightRadius: msg.role === 'user' ? 4 : 16,
                                            backgroundColor: msg.role === 'user' ? '#2563EB' : '#1F2937',
                                            border: msg.role === 'user' ? 'none' : '1px solid #374151',
                                            color: '#F3F4F6',
                                            fontSize: 15,
                                            lineHeight: 1.6
                                        }}
                                    >
                                        <div style={{ whiteSpace: 'pre-wrap' }}>
                                            {msg.content}
                                            {msg.role === 'assistant' && isStreaming && idx === messages.length - 1 && (
                                                <span className="inline-block w-2 h-4 bg-blue-400 ml-1 animate-pulse" />
                                            )}
                                        </div>
                                    </div>
                                    {msg.role === 'user' && (
                                        <Avatar
                                            size={36}
                                            icon={<User size={20} />}
                                            style={{ backgroundColor: '#374151', color: '#D1D5DB', flexShrink: 0 }}
                                        />
                                    )}
                                </div>
                            ))}

                            {/* Thinking indicator */}
                            {isStreaming && (messages.length === 0 || messages[messages.length - 1]?.role === 'user') && (
                                <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-start' }}>
                                    <Avatar
                                        size={36}
                                        icon={<Bot size={20} />}
                                        style={{ backgroundColor: 'rgba(37, 99, 235, 0.2)', color: '#60A5FA', flexShrink: 0 }}
                                    />
                                    <div
                                        style={{
                                            padding: '12px 16px',
                                            borderRadius: 16,
                                            borderTopLeftRadius: 4,
                                            backgroundColor: '#1F2937',
                                            border: '1px solid #374151',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 12
                                        }}
                                    >
                                        <div className="flex gap-1">
                                            <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                            <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                            <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                        </div>
                                        <Text style={{ color: '#9CA3AF', fontSize: 14 }}>AI 正在思考...</Text>
                                    </div>
                                </div>
                            )}

                            {error && (
                                <div style={{ textAlign: 'center' }}>
                                    <Text type="danger">出错了: {error}</Text>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    </div>

                    {/* Input Area */}
                    <div style={{
                        padding: '16px 24px',
                        background: 'rgba(17, 24, 39, 0.5)',
                        borderTop: '1px solid rgba(255,255,255,0.05)',
                        backdropFilter: 'blur(8px)'
                    }}>
                        <form onSubmit={handleSubmit} style={{ maxWidth: 800, margin: '0 auto', display: 'flex', gap: 12 }}>
                            <Input
                                size="large"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="输入你的问题..."
                                disabled={isStreaming}
                                style={{
                                    backgroundColor: '#1F2937',
                                    borderColor: '#374151',
                                    color: '#F3F4F6',
                                    borderRadius: 12,
                                    padding: '12px 16px'
                                }}
                            />
                            {isStreaming ? (
                                <Button
                                    size="large"
                                    type="primary"
                                    danger
                                    onClick={stop}
                                    icon={<Square size={18} />}
                                    style={{ borderRadius: 12, height: 'auto', padding: '0 24px' }}
                                >
                                    停止
                                </Button>
                            ) : (
                                <Button
                                    size="large"
                                    type="primary"
                                    htmlType="submit"
                                    disabled={!input.trim()}
                                    icon={<Send size={18} />}
                                    style={{
                                        borderRadius: 12,
                                        height: 'auto',
                                        padding: '0 24px',
                                        backgroundColor: input.trim() ? '#2563EB' : undefined
                                    }}
                                >
                                    发送
                                </Button>
                            )}
                        </form>
                    </div>
                </Content>
            </Layout>
        </Layout>
    );
}
