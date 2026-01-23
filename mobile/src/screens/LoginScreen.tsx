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
        if (!canSubmit) return;

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
                    <Text style={styles.title}>classPlatform</Text>
                    <Text style={styles.subtitle}>AI 智能教学辅导平台</Text>
                </View>

                <View style={styles.form}>
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>用户名</Text>
                        <TextInput
                            style={styles.input}
                            value={username}
                            onChangeText={setUsername}
                            placeholder="请输入用户名"
                            placeholderTextColor="#64748b"
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
                            placeholderTextColor="#64748b"
                            secureTextEntry
                            editable={!loading}
                        />
                    </View>

                    {error && (
                        <View style={styles.errorBanner}>
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    )}

                    <Pressable
                        style={({ pressed }) => [
                            styles.button,
                            !canSubmit && styles.buttonDisabled,
                            pressed && canSubmit && styles.buttonPressed,
                        ]}
                        onPress={handleLogin}
                        disabled={!canSubmit}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <Text style={styles.buttonText}>登 录</Text>
                        )}
                    </Pressable>

                    <Text style={styles.hint}>提示：使用测试账号 student1 / password123</Text>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0b1220',
    },
    inner: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    header: {
        alignItems: 'center',
        marginBottom: 48,
    },
    title: {
        fontSize: 32,
        fontWeight: '700',
        color: '#f8fafc',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 14,
        color: '#94a3b8',
    },
    form: {
        gap: 16,
    },
    inputGroup: {
        gap: 6,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: '#cbd5e1',
        marginLeft: 4,
    },
    input: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        color: '#f8fafc',
        borderWidth: 1,
        borderColor: '#334155',
    },
    errorBanner: {
        backgroundColor: '#450a0a',
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 14,
    },
    errorText: {
        color: '#fca5a5',
        fontSize: 13,
        textAlign: 'center',
    },
    button: {
        backgroundColor: '#2563eb',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 8,
    },
    buttonDisabled: {
        backgroundColor: '#1e40af',
        opacity: 0.6,
    },
    buttonPressed: {
        opacity: 0.85,
    },
    buttonText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '600',
    },
    hint: {
        color: '#64748b',
        fontSize: 12,
        textAlign: 'center',
        marginTop: 16,
    },
});
