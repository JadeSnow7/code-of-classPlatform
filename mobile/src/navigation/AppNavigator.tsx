import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, Text, View } from 'react-native';

import type { AuthSession, ChatMessage, Course } from '../types';
import { palette } from '../theme';

import LoginScreen from '../screens/LoginScreen';
import CoursesScreen from '../screens/CoursesScreen';
import CourseDetailScreen from '../screens/CourseDetailScreen';
import ChapterContentScreen from '../screens/ChapterContentScreen';
import ChatScreen from '../screens/ChatScreen';
import ProfileScreen from '../screens/ProfileScreen';
import AssignmentDetailScreen from '../screens/AssignmentDetailScreen';
import QuizDetailScreen from '../screens/QuizDetailScreen';
import WritingDetailScreen from '../screens/WritingDetailScreen';
import WritingStudioScreen from '../screens/WritingStudioScreen';

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

export type ChatStackParamList = {
    ChatMain: { courseId?: number; courseTitle?: string } | undefined;
};

export type HomeStackParamList = {
    Courses: undefined;
    CourseDetail: { course: Course };
    ChapterContent: { chapterId: number; title: string };
    AssignmentDetail: { assignmentId: number; courseId: number; title?: string };
    QuizDetail: { quizId: number; courseId: number; title?: string };
    WritingDetail: { submissionId: number; courseId: number; title?: string };
    WritingStudio: { courseId: number; courseTitle: string };
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainTab = createBottomTabNavigator<MainTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const ChatStack = createNativeStackNavigator<ChatStackParamList>();

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
    const icons: Record<string, string> = {
        home: '📚',
        chat: '💬',
        profile: '👤',
    };

    return (
        <View style={styles.tabIcon}>
            <Text style={{ fontSize: focused ? 21 : 19 }}>{icons[name] || '•'}</Text>
        </View>
    );
}

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

function HomeNavigator({ session }: { session: AuthSession }) {
    return (
        <HomeStack.Navigator
            screenOptions={{
                headerStyle: { backgroundColor: palette.background },
                headerTintColor: palette.textPrimary,
                headerTitleStyle: { fontWeight: '700' },
                headerShadowVisible: false,
                contentStyle: { backgroundColor: palette.background },
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
            <HomeStack.Screen
                name="AssignmentDetail"
                options={({ route }) => ({ title: route.params.title || '作业详情' })}
            >
                {(props) => <AssignmentDetailScreen {...props} session={session} />}
            </HomeStack.Screen>
            <HomeStack.Screen
                name="QuizDetail"
                options={({ route }) => ({ title: route.params.title || '测验详情' })}
            >
                {(props) => <QuizDetailScreen {...props} session={session} />}
            </HomeStack.Screen>
            <HomeStack.Screen
                name="WritingDetail"
                options={({ route }) => ({ title: route.params.title || '写作详情' })}
            >
                {(props) => <WritingDetailScreen {...props} session={session} />}
            </HomeStack.Screen>
            <HomeStack.Screen
                name="WritingStudio"
                options={({ route }) => ({ title: route.params.courseTitle + ' · 写作助手' })}
            >
                {(props) => <WritingStudioScreen {...props} session={session} />}
            </HomeStack.Screen>
        </HomeStack.Navigator>
    );
}

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
                    backgroundColor: palette.background,
                    borderTopColor: palette.border,
                    borderTopWidth: 1,
                    height: 62,
                    paddingBottom: 8,
                    paddingTop: 6,
                },
                tabBarActiveTintColor: palette.primary,
                tabBarInactiveTintColor: palette.textMuted,
                tabBarLabelStyle: {
                    fontSize: 11,
                    fontWeight: '600',
                },
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
                    headerShown: false,
                }}
            >
                {() => (
                    <ChatStack.Navigator
                        screenOptions={{
                            headerStyle: { backgroundColor: palette.background },
                            headerTintColor: palette.textPrimary,
                            headerTitleStyle: { fontWeight: '700' },
                            headerShadowVisible: false,
                            contentStyle: { backgroundColor: palette.background },
                        }}
                    >
                        <ChatStack.Screen
                            name="ChatMain"
                            options={({ route }) => ({
                                title: route.params?.courseTitle
                                    ? `${route.params.courseTitle} · AI 助教`
                                    : 'AI 助教',
                            })}
                        >
                            {(props) => (
                                <ChatScreen
                                    {...props}
                                    session={session}
                                    messages={messages}
                                    setMessages={setMessages}
                                />
                            )}
                        </ChatStack.Screen>
                    </ChatStack.Navigator>
                )}
            </MainTab.Screen>
            <MainTab.Screen
                name="ProfileTab"
                options={{
                    title: '我的',
                    tabBarIcon: ({ focused }) => <TabIcon name="profile" focused={focused} />,
                    headerShown: true,
                    headerStyle: { backgroundColor: palette.background },
                    headerTintColor: palette.textPrimary,
                    headerTitle: '个人中心',
                    headerTitleStyle: { fontWeight: '700' },
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
    },
});
