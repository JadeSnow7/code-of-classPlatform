import { StyleSheet, Text, View } from 'react-native';
import type { ChatMessage } from '../types';
import { palette, radius, spacing } from '../theme';

type MessageBubbleProps = {
    message: ChatMessage;
};

export default function MessageBubble({ message }: MessageBubbleProps) {
    const isUser = message.role === 'user';

    return (
        <View style={[styles.container, isUser ? styles.containerUser : styles.containerAssistant]}>
            <View style={styles.row}>
                {!isUser ? <View style={styles.avatar}><Text style={styles.avatarText}>AI</Text></View> : null}
                <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
                    <Text style={[styles.text, isUser ? styles.textUser : styles.textAssistant]}>
                        {message.content}
                    </Text>
                </View>
                {isUser ? <View style={styles.avatarUser}><Text style={styles.avatarText}>你</Text></View> : null}
            </View>
            <Text style={[styles.time, isUser ? styles.timeUser : styles.timeAssistant]}>
                {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: spacing.sm,
        maxWidth: '95%',
    },
    containerUser: {
        alignSelf: 'flex-end',
        alignItems: 'flex-end',
    },
    containerAssistant: {
        alignSelf: 'flex-start',
        alignItems: 'flex-start',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: spacing.xs,
    },
    avatar: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#312e81',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 2,
    },
    avatarUser: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#0f766e',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 2,
    },
    avatarText: {
        color: '#e0e7ff',
        fontSize: 10,
        fontWeight: '700',
    },
    bubble: {
        borderRadius: radius.lg,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
        maxWidth: '86%',
    },
    bubbleUser: {
        backgroundColor: palette.primary,
        borderBottomRightRadius: 6,
    },
    bubbleAssistant: {
        backgroundColor: palette.backgroundPanel,
        borderBottomLeftRadius: 6,
        borderWidth: 1,
        borderColor: palette.border,
    },
    text: {
        fontSize: 14,
        lineHeight: 21,
    },
    textUser: {
        color: palette.textPrimary,
    },
    textAssistant: {
        color: palette.textSecondary,
    },
    time: {
        fontSize: 10,
        marginTop: 4,
    },
    timeUser: {
        color: palette.textMuted,
        marginRight: 30,
    },
    timeAssistant: {
        color: palette.textMuted,
        marginLeft: 30,
    },
});
