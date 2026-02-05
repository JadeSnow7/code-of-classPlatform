import type { Meta, StoryObj } from '@storybook/react';
import type { StudentGlobalProfile } from '@/lib/student-api';
import GlobalProfileCard from './GlobalProfileCard';

const baseProfile: StudentGlobalProfile = {
    student_id: 101,
    learning_style: JSON.stringify({ preferred_time: 'morning', pace: 'fast' }),
    global_competencies: JSON.stringify({
        academic_writing: 0.78,
        citation: 0.62,
        structure: 0.7,
        logic: 0.66,
        vocabulary: 0.58,
        grammar: 0.72,
        critical_thinking: 0.61,
    }),
    total_study_hours: 128,
    updated_at: new Date().toISOString(),
};

const meta: Meta<typeof GlobalProfileCard> = {
    title: 'Components/GlobalProfileCard',
    component: GlobalProfileCard,
    args: {
        studentId: 101,
        disableAutoLoad: true,
        initialProfile: baseProfile,
        initialLoading: false,
    },
};

export default meta;
type Story = StoryObj<typeof GlobalProfileCard>;

export const Default: Story = {};

export const Loading: Story = {
    args: {
        initialLoading: true,
        initialProfile: null,
        initialError: '',
    },
};

export const ErrorState: Story = {
    args: {
        initialLoading: false,
        initialProfile: null,
        initialError: '加载档案失败',
    },
};

export const NoCompetencies: Story = {
    args: {
        initialProfile: {
            ...baseProfile,
            global_competencies: '',
        },
    },
};

export const LearningStyleOnly: Story = {
    args: {
        initialProfile: {
            ...baseProfile,
            global_competencies: '',
            total_study_hours: 54,
        },
    },
};

export const EveningSlowPace: Story = {
    args: {
        initialProfile: {
            ...baseProfile,
            learning_style: JSON.stringify({ preferred_time: 'evening', pace: 'slow' }),
            total_study_hours: 92,
        },
    },
};

export const HighHours: Story = {
    args: {
        initialProfile: {
            ...baseProfile,
            total_study_hours: 420,
        },
    },
};

export const EmptyProfile: Story = {
    args: {
        initialProfile: {
            student_id: 101,
            learning_style: '',
            global_competencies: '',
            total_study_hours: 0,
            updated_at: '',
        },
    },
};
