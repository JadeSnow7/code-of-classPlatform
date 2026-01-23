import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet } from 'react-native';

import type { AuthSession, ChatMessage, Course } from '../types';

// Import screens
import LoginScreen from '../screens/LoginScreen';
import CoursesScreen from '../screens/CoursesScreen';
import CourseDetailScreen from '../screens/CourseDetailScreen';
import ChapterContentScreen from '../screens/ChapterContentScreen';
import ChatScreen from '../screens/ChatScreen';
import ProfileScreen from '../screens/ProfileScreen';

// Navigation types
export type RootStackParamList = {
    Auth: undefined;
    Main: undefined;
};

export type AuthStackParamList = {
    Login: undefined;
};

export type MainTabParamList = {
    HomeTab: undefined;
    ChatTab: undefined;
    ProfileTab: undefined;
};

export type HomeStackParamList = {
    Courses: undefined;
    CourseDetail: { course: Course };
    ChapterContent: { chapterId: number; title: string };
};

// Stack and Tab navigators
const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainTab = createBottomTabNavigator<MainTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();

// Tab icons
function TabIcon({ name, focused }: { name: string; focused: boolean }) {
    const icons: Record<string, string> = {
        home: '📚',
        chat: '💬',
        profile: '👤',
    };
    return (
        <View style={styles.tabIcon}>
            <Text style={{ fontSize: focused ? 22 : 20 }}>{icons[name] || '•'}</Text>
        </View>
    );
}

// Auth Stack Navigator
function AuthNavigator({
    onLoginSuccess,
}: {
    onLoginSuccess: (session: AuthSession) => void;
}) {
    return (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
            <AuthStack.Screen name="Login">
                {() => <LoginScreen onLoginSuccess={onLoginSuccess} />}
            </AuthStack.Screen>
        </AuthStack.Navigator>
    );
}

// Home Stack Navigator
function HomeNavigator({ session }: { session: AuthSession }) {
    return (
        <HomeStack.Navigator
            screenOptions={{
                headerStyle: { backgroundColor: '#0b1220' },
                headerTintColor: '#f8fafc',
                headerTitleStyle: { fontWeight: '600' },
            }}
        >
            <HomeStack.Screen name="Courses" options={{ title: '我的课程' }}>
                {(props) => <CoursesScreen {...props} session={session} />}
            </HomeStack.Screen>
            <HomeStack.Screen
                name="CourseDetail"
                options={({ route }) => ({ title: route.params.course.name })}
            >
                {(props) => <CourseDetailScreen {...props} session={session} />}
            </HomeStack.Screen>
            <HomeStack.Screen
                name="ChapterContent"
                options={({ route }) => ({ title: route.params.title })}
            >
                {(props) => <ChapterContentScreen {...props} session={session} />}
            </HomeStack.Screen>
        </HomeStack.Navigator>
    );
}

// Main Tab Navigator
function MainNavigator({
    session,
    messages,
    setMessages,
    onClearMessages,
    onSignOut,
}: {
    session: AuthSession;
    messages: ChatMessage[];
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    onClearMessages: () => void;
    onSignOut: () => void;
}) {
    return (
        <MainTab.Navigator
            screenOptions={{
                tabBarStyle: {
                    backgroundColor: '#0b1220',
                    borderTopColor: '#1f2937',
                    borderTopWidth: 1,
                },
                tabBarActiveTintColor: '#60a5fa',
                tabBarInactiveTintColor: '#94a3b8',
                headerShown: false,
            }}
        >
            <MainTab.Screen
                name="HomeTab"
                options={{
                    title: '课程',
                    tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />,
                }}
            >
                {() => <HomeNavigator session={session} />}
            </MainTab.Screen>
            <MainTab.Screen
                name="ChatTab"
                options={{
                    title: 'AI 助教',
                    tabBarIcon: ({ focused }) => <TabIcon name="chat" focused={focused} />,
                    headerShown: true,
                    headerStyle: { backgroundColor: '#0b1220' },
                    headerTintColor: '#f8fafc',
                }}
            >
                {() => (
                    <ChatScreen session={session} messages={messages} setMessages={setMessages} />
                )}
            </MainTab.Screen>
            <MainTab.Screen
                name="ProfileTab"
                options={{
                    title: '我的',
                    tabBarIcon: ({ focused }) => <TabIcon name="profile" focused={focused} />,
                    headerShown: true,
                    headerStyle: { backgroundColor: '#0b1220' },
                    headerTintColor: '#f8fafc',
                    headerTitle: '个人中心',
                }}
            >
                {() => (
                    <ProfileScreen
                        session={session}
                        messagesCount={messages.length}
                        onClearMessages={onClearMessages}
                        onSignOut={onSignOut}
                    />
                )}
            </MainTab.Screen>
        </MainTab.Navigator>
    );
}

// Root Navigator
export default function AppNavigator({
    session,
    messages,
    setMessages,
    onLoginSuccess,
    onClearMessages,
    onSignOut,
}: {
    session: AuthSession | null;
    messages: ChatMessage[];
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    onLoginSuccess: (session: AuthSession) => void;
    onClearMessages: () => void;
    onSignOut: () => void;
}) {
    return (
        <NavigationContainer>
            <RootStack.Navigator screenOptions={{ headerShown: false }}>
                {session ? (
                    <RootStack.Screen name="Main">
                        {() => (
                            <MainNavigator
                                session={session}
                                messages={messages}
                                setMessages={setMessages}
                                onClearMessages={onClearMessages}
                                onSignOut={onSignOut}
                            />
                        )}
                    </RootStack.Screen>
                ) : (
                    <RootStack.Screen name="Auth">
                        {() => <AuthNavigator onLoginSuccess={onLoginSuccess} />}
                    </RootStack.Screen>
                )}
            </RootStack.Navigator>
        </NavigationContainer>
    );
}

const styles = StyleSheet.create({
    tabIcon: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 4,
    },
});
