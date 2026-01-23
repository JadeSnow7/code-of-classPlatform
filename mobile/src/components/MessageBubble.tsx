import { StyleSheet, Text, View } from 'react-native';
import type { ChatMessage } from '../types';

type MessageBubbleProps = {
    message: ChatMessage;
};

export default function MessageBubble({ message }: MessageBubbleProps) {
    const isUser = message.role === 'user';

    return (
        <View style={[styles.container, isUser ? styles.containerUser : styles.containerAssistant]}>
            <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
                <Text style={[styles.text, isUser ? styles.textUser : styles.textAssistant]}>
                    {message.content}
                </Text>
            </View>
            <Text style={[styles.time, isUser ? styles.timeUser : styles.timeAssistant]}>
                {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 12,
        maxWidth: '85%',
    },
    containerUser: {
        alignSelf: 'flex-end',
        alignItems: 'flex-end',
    },
    containerAssistant: {
        alignSelf: 'flex-start',
        alignItems: 'flex-start',
    },
    bubble: {
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    bubbleUser: {
        backgroundColor: '#2563eb',
        borderBottomRightRadius: 4,
    },
    bubbleAssistant: {
        backgroundColor: '#1e293b',
        borderBottomLeftRadius: 4,
        borderWidth: 1,
        borderColor: '#334155',
    },
    text: {
        fontSize: 15,
        lineHeight: 22,
    },
    textUser: {
        color: '#fff',
    },
    textAssistant: {
        color: '#e2e8f0',
    },
    time: {
        fontSize: 10,
        marginTop: 4,
    },
    timeUser: {
        color: '#64748b',
    },
    timeAssistant: {
        color: '#64748b',
    },
});
