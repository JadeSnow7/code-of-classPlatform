/**
 * AI API types and lightweight helpers.
 */
import type { ChatMessage } from '@classplatform/shared';
/** Chat message payload type. */
export type { ChatMessage };

export const aiApi = {
    /**
     * Fetch chat history when a server endpoint is available.
     *
     * @returns The chat history list.
     */
    async getHistory(): Promise<ChatMessage[]> {
        // Placeholder for future history endpoint
        return [];
    }
};
