import { useState, useRef, useEffect, type FormEvent } from 'react';
import { useChatStore } from '@/domains/chat/useChatStore';
import { Send, Square, Bot, User, Plus, Trash2, MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';

export function ChatPage() {
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

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!input.trim() || status === 'streaming') return;
        sendMessage(input.trim());
        setInput('');
    };

    const isStreaming = status === 'streaming';

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <div className="h-screen flex flex-col md:flex-row relative">
            {/* Mobile Header Toggle */}
            <div className="md:hidden flex items-center justify-between px-4 h-14 bg-gray-900 border-b border-gray-800 shrink-0">
                <button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="p-2 -ml-2 text-gray-400 hover:text-white"
                >
                    <MessageSquare className="w-6 h-6" />
                </button>
                <span className="font-semibold text-white">AI 智能答疑</span>
                <div className="w-8" /> {/* Spacer */}
            </div>

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
                    <h1 className="text-xl font-semibold text-white flex items-center gap-2">
                        <Bot className="w-6 h-6 text-blue-400" />
                        AI 智能答疑
                    </h1>
                    <p className="text-sm text-gray-400 mt-1">
                        向 AI 助手提问有关电磁学的问题
                    </p>
                </header>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {messages.length === 0 && (
                        <div className="text-center text-gray-500 py-12">
                            <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>开始提问吧！例如：&quot;请解释高斯定律&quot;</p>
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
                    </div>
                </form>
            </div>
        </div>
    );
}

