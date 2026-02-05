import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppNavigator from './src/navigation/AppNavigator';
import { getWecomOAuthURL, wecomLogin } from './src/api';
import {
  clearAuthSession,
  clearMessages,
  loadAuthSession,
  loadMessages,
  saveAuthSession,
  saveMessages,
} from './src/storage';
import type { AuthSession, ChatMessage } from './src/types';
import { getRedirectURIForWecomOAuth, getUrlParam, isWecomWebView, removeUrlParams } from './src/wecom';

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [booting, setBooting] = useState(true);
  const [wecomAutoLogin, setWecomAutoLogin] = useState(false);
  const [wecomError, setWecomError] = useState<string | null>(null);
  const wecomAttemptedRef = useRef(false);

  // Load stored session and messages on boot
  useEffect(() => {
    let isActive = true;

    const bootstrap = async () => {
      const [storedSession, storedMessages] = await Promise.all([
        loadAuthSession(),
        loadMessages(),
      ]);

      if (!isActive) return;

      setSession(storedSession);
      setMessages(storedMessages);
      setBooting(false);
    };

    bootstrap();

    return () => {
      isActive = false;
    };
  }, []);

  // WeCom silent login (web only)
  useEffect(() => {
    if (booting) return;
    if (session) return;
    if (Platform.OS !== 'web') return;
    if (!isWecomWebView()) return;
    if (wecomAttemptedRef.current) return;

    wecomAttemptedRef.current = true;

    let cancelled = false;

    const run = async () => {
      setWecomError(null);
      setWecomAutoLogin(true);

      try {
        const code = getUrlParam('code');
        if (code) {
          const newSession = await wecomLogin(code);
          if (cancelled) return;
          setSession(newSession);
          await saveAuthSession(newSession);
          removeUrlParams(['code', 'state']);
          return;
        }

        const redirectURI = getRedirectURIForWecomOAuth();
        const oauthURL = await getWecomOAuthURL(redirectURI, 'wecom');
        if (cancelled) return;
        window.location.replace(oauthURL);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'WeCom auto login failed';
        setWecomError(message);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [booting, session]);

  // Persist messages when they change
  useEffect(() => {
    if (!booting) {
      void saveMessages(messages);
    }
  }, [messages, booting]);

  const handleLoginSuccess = async (newSession: AuthSession) => {
    setSession(newSession);
    await saveAuthSession(newSession);
  };

  const handleClearMessages = async () => {
    setMessages([]);
    await clearMessages();
  };

  const handleSignOut = async () => {
    setSession(null);
    await clearAuthSession();
  };

  if (booting) {
    return (
      <View style={styles.bootContainer}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#60a5fa" />
        <Text style={styles.bootText}>加载 classPlatform...</Text>
      </View>
    );
  }

  if (!session && wecomAutoLogin) {
    return (
      <View style={styles.bootContainer}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#60a5fa" />
        <Text style={styles.bootText}>企业微信免登中...</Text>
        {wecomError ? (
          <>
            <Text style={styles.bootErrorText}>{wecomError}</Text>
            <Pressable style={styles.bootFallbackButton} onPress={() => setWecomAutoLogin(false)}>
              <Text style={styles.bootFallbackButtonText}>使用账号密码登录</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppNavigator
        session={session}
        messages={messages}
        setMessages={setMessages}
        onLoginSuccess={handleLoginSuccess}
        onClearMessages={handleClearMessages}
        onSignOut={handleSignOut}
      />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  bootContainer: {
    flex: 1,
    backgroundColor: '#0b1220',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  bootText: {
    marginTop: 16,
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
  },
  bootErrorText: {
    marginTop: 12,
    color: '#fca5a5',
    fontSize: 12,
    textAlign: 'center',
  },
  bootFallbackButton: {
    marginTop: 16,
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  bootFallbackButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
