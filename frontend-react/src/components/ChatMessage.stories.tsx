import type { Meta, StoryObj } from '@storybook/react';
import { Bot, User } from 'lucide-react';
import { clsx } from 'clsx';

// Extracted ChatMessage component for Storybook
export interface ChatMessageProps {
    role: 'user' | 'assistant';
    content: string;
    isStreaming?: boolean;
}

export function ChatMessage({ role, content, isStreaming = false }: ChatMessageProps) {
    return (
        <div
            className={clsx(
                'flex gap-3',
                role === 'user' ? 'justify-end' : 'justify-start'
            )}
        >
            {role === 'assistant' && (
                <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-blue-400" />
                </div>
            )}
            <div
                className={clsx(
                    'max-w-[70%] px-4 py-3 rounded-2xl',
                    role === 'user'
                        ? 'bg-blue-600 text-white rounded-br-md'
                        : 'bg-gray-800 text-gray-100 rounded-bl-md border border-gray-700'
                )}
            >
                <p className="whitespace-pre-wrap">
                    {content}
                    {role === 'assistant' && isStreaming && (
                        <span className="inline-block w-2 h-4 bg-blue-400 ml-1 animate-pulse" />
                    )}
                </p>
            </div>
            {role === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-gray-300" />
                </div>
            )}
        </div>
    );
}

const meta: Meta<typeof ChatMessage> = {
    title: 'Pages/Chat/ChatMessage',
    component: ChatMessage,
    decorators: [
        (Story) => (
            <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8">
                <div className="max-w-2xl mx-auto space-y-4">
                    <Story />
                </div>
            </div>
        ),
    ],
    args: {
        role: 'assistant',
        content: '高斯定律是电磁学中的基本定律之一，它描述了电场与电荷之间的关系。',
    },
};

export default meta;
type Story = StoryObj<typeof ChatMessage>;

export const AssistantMessage: Story = {};

export const UserMessage: Story = {
    args: {
        role: 'user',
        content: '请解释什么是高斯定律？',
    },
};

export const StreamingMessage: Story = {
    args: {
        role: 'assistant',
        content: 'AI 正在生成回复...',
        isStreaming: true,
    },
};

export const LongMessage: Story = {
    args: {
        role: 'assistant',
        content: `高斯定律（Gauss's Law）是电磁学中的四个麦克斯韦方程之一。

它的数学表述为：
∮ E · dA = Q_enc / ε₀

其中：
- ∮ E · dA 表示电场 E 通过闭合曲面的通量
- Q_enc 是闭合曲面内包围的总电荷
- ε₀ 是真空介电常数

高斯定律告诉我们，通过任意闭合曲面的电通量只与该曲面内的电荷有关，与曲面外的电荷无关。`,
    },
};

export const CodeInMessage: Story = {
    args: {
        role: 'assistant',
        content: `这是一个简单的 Python 示例：

\`\`\`python
import numpy as np

def calculate_electric_field(q, r):
    k = 8.99e9  # 库仑常数
    return k * q / (r ** 2)
\`\`\`

这个函数计算点电荷产生的电场强度。`,
    },
};
