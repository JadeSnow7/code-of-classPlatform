import { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { login } from '../api';
import type { AuthSession } from '../types';
import { palette, radius, spacing } from '../theme';

type LoginScreenProps = {
    onLoginSuccess: (session: AuthSession) => void;
};

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canSubmit = username.trim().length > 0 && password.length > 0 && !loading;

    const handleLogin = async () => {
        if (!canSubmit) {
            return;
        }

        setError(null);
        setLoading(true);

        try {
            const session = await login(username.trim(), password);
            onLoginSuccess(session);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Login failed';
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                style={styles.inner}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={styles.header}>
                    <View style={styles.logoCircle}>
                        <Text style={styles.logoText}>⚡</Text>
                    </View>
                    <Text style={styles.title}>电磁学教学平台</Text>
                    <Text style={styles.subtitle}>AI 驱动的智能学习系统</Text>
                </View>

                <View style={styles.form}>
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>用户名</Text>
                        <TextInput
                            style={styles.input}
                            value={username}
                            onChangeText={setUsername}
                            placeholder="请输入用户名"
                            placeholderTextColor={palette.textMuted}
                            autoCapitalize="none"
                            autoCorrect={false}
                            editable={!loading}
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>密码</Text>
                        <TextInput
                            style={styles.input}
                            value={password}
                            onChangeText={setPassword}
                            placeholder="请输入密码"
                            placeholderTextColor={palette.textMuted}
                            secureTextEntry
                            editable={!loading}
                        />
                    </View>

                    {error ? (
                        <View style={styles.errorBanner}>
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    ) : null}

                    <Pressable
                        style={({ pressed }) => [
                            styles.button,
                            !canSubmit && styles.buttonDisabled,
                            pressed && canSubmit && styles.buttonPressed,
                        ]}
                        onPress={() => void handleLogin()}
                        disabled={!canSubmit}
                    >
                        {loading ? (
                            <ActivityIndicator color={palette.textPrimary} size="small" />
                        ) : (
                            <Text style={styles.buttonText}>登 录</Text>
                        )}
                    </Pressable>

                    <Text style={styles.hint}>测试账号：student1 / password123</Text>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: palette.background,
    },
    inner: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: spacing.xl,
    },
    header: {
        alignItems: 'center',
        marginBottom: spacing.xxl,
    },
    logoCircle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        borderWidth: 1,
        borderColor: '#1f3b72',
        backgroundColor: '#0e1b35',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.md,
    },
    logoText: {
        fontSize: 28,
    },
    title: {
        fontSize: 30,
        fontWeight: '800',
        color: palette.textPrimary,
        marginBottom: spacing.xs,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 13,
        color: palette.textMuted,
        textAlign: 'center',
    },
    form: {
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.backgroundPanel,
    },
    inputGroup: {
        gap: 6,
    },
    label: {
        color: palette.textSecondary,
        fontSize: 12,
        fontWeight: '600',
        marginLeft: 2,
    },
    input: {
        backgroundColor: palette.background,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        fontSize: 15,
        color: palette.textPrimary,
        borderWidth: 1,
        borderColor: palette.border,
    },
    errorBanner: {
        backgroundColor: '#450a0a',
        borderRadius: radius.md,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.sm,
        borderWidth: 1,
        borderColor: '#7f1d1d',
    },
    errorText: {
        color: '#fca5a5',
        fontSize: 12,
        textAlign: 'center',
    },
    button: {
        minHeight: 46,
        borderRadius: radius.md,
        backgroundColor: palette.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 4,
    },
    buttonDisabled: {
        backgroundColor: palette.primaryMuted,
        opacity: 0.5,
    },
    buttonPressed: {
        opacity: 0.86,
    },
    buttonText: {
        color: palette.textPrimary,
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 1.2,
    },
    hint: {
        color: palette.textMuted,
        fontSize: 11,
        textAlign: 'center',
    },
});
