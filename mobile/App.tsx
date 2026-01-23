import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppNavigator from './src/navigation/AppNavigator';
import {
  clearAuthSession,
  clearMessages,
  loadAuthSession,
  loadMessages,
  saveAuthSession,
  saveMessages,
} from './src/storage';
import type { AuthSession, ChatMessage } from './src/types';

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [booting, setBooting] = useState(true);

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
  },
  bootText: {
    marginTop: 16,
    color: '#94a3b8',
    fontSize: 14,
  },
});
