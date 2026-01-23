// AI API types and helpers

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export const aiApi = {
    async getHistory(): Promise<ChatMessage[]> {
        // Placeholder for future history endpoint
        return [];
    }
};
