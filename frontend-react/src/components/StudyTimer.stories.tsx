import type { Meta, StoryObj } from '@storybook/react';
import { StudyTimer } from './StudyTimer';

const meta: Meta<typeof StudyTimer> = {
    title: 'Components/StudyTimer',
    component: StudyTimer,
    args: {
        chapterId: 1,
        initialDuration: 3600,
        enableHeartbeat: false,
    },
};

export default meta;
type Story = StoryObj<typeof StudyTimer>;

export const Default: Story = {};

export const Paused: Story = {
    args: {
        initialTracking: false,
    },
};

export const ShortSession: Story = {
    args: {
        initialDuration: 300,
    },
};

export const LongSession: Story = {
    args: {
        initialDuration: 14400,
    },
};

export const WithError: Story = {
    args: {
        initialError: '同步失败',
    },
};

export const HeartbeatDisabled: Story = {
    args: {
        enableHeartbeat: false,
    },
};
