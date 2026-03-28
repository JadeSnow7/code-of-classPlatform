import { message } from 'antd';

type ErrorFeedbackOptions = {
    silent?: boolean;
};

export function notifyApiSuccess(content: string) {
    void message.success(content);
}

export function notifyApiError(content: string, options?: ErrorFeedbackOptions) {
    if (options?.silent) {
        return;
    }
    void message.error(content);
}
