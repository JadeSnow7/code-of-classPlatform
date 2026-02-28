import type { Meta, StoryObj } from '@storybook/react';
import { WritingPolishPanel } from './WritingPolishPanel';

const sampleResult = {
    original: 'This paper discuss the importance of experiments in physics.',
    polished: 'This paper discusses the importance of experiments in physics.',
    changes: [
        {
            type: 'Grammar',
            original_fragment: 'discuss',
            revised_fragment: 'discusses',
            reason: 'Subject-verb agreement for singular subject.',
        },
    ],
    overall_comment: '总体表达清晰，注意主谓一致。',
};

const sampleResultNoChanges = {
    original: 'This is a well-written paragraph.',
    polished: 'This is a well-written paragraph.',
    changes: [],
    overall_comment: '没有发现明显问题，保持即可。',
};

const meta: Meta<typeof WritingPolishPanel> = {
    title: 'Components/WritingPolishPanel',
    component: WritingPolishPanel,
};

export default meta;
type Story = StoryObj<typeof WritingPolishPanel>;

export const Empty: Story = {};

export const WithInput: Story = {
    args: {
        initialInput: 'This paper discuss the importance of experiments in physics.',
    },
};

export const Loading: Story = {
    args: {
        initialInput: 'This paper discuss the importance of experiments in physics.',
        initialLoading: true,
    },
};

export const ErrorState: Story = {
    args: {
        initialInput: 'This paper discuss the importance of experiments in physics.',
        initialError: '请求失败，请稍后重试',
    },
};

export const WithResult: Story = {
    args: {
        initialInput: sampleResult.original,
        initialResult: sampleResult,
    },
};

export const WithResultNoChanges: Story = {
    args: {
        initialInput: sampleResultNoChanges.original,
        initialResult: sampleResultNoChanges,
    },
};
