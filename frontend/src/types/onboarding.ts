export type MajorTrack =
    | 'ic_design'
    | 'microelectronics'
    | 'electronic_info'
    | 'cross_discipline';

export type CurrentTask =
    | 'course_paper'
    | 'lab_report'
    | 'english_abstract_mail'
    | 'literature_review'
    | 'proposal_midterm'
    | 'thesis_chapter'
    | 'unclear';

export type PrimaryPlatform =
    | 'windows'
    | 'macos_apple_silicon'
    | 'macos_intel'
    | 'linux'
    | 'mobile_tablet';

export type LocalComputeTier =
    | 'cpu_only'
    | 'nvidia_gpu'
    | 'apple_silicon_local'
    | 'unknown'
    | 'no_local';

export type NetworkTier =
    | 'stable_network'
    | 'occasional_hotspot'
    | 'weak_network'
    | 'offline_expected';

export type WritingStage =
    | 'beginner_zero'
    | 'first_paper'
    | 'published_experience'
    | 'thesis_in_progress';

export type PainPoint =
    | 'literature_search'
    | 'citation_management'
    | 'structure_logic'
    | 'academic_tone_rewriting'
    | 'results_discussion'
    | 'english_expression'
    | 'research_question'
    | 'other';

export type PriorAiTool =
    | 'chatgpt'
    | 'kimi'
    | 'deepseek'
    | 'wenxin'
    | 'qwen'
    | 'gemini'
    | 'copilot'
    | 'academic_tools'
    | 'other'
    | 'none';

export type PreferredTime = 'morning' | 'afternoon' | 'evening' | 'late_night' | 'flexible';

export type GuidanceStyle = 'strict_scaffold' | 'options_guidance' | 'rewrite_then_explain';

export type FeedbackVerbosity = 'concise' | 'balanced' | 'detailed';

export type OnboardingProfilePayload = {
    major_track: MajorTrack;
    current_tasks: CurrentTask[];
    primary_platform: PrimaryPlatform;
    local_compute_tier: LocalComputeTier;
    network_tier: NetworkTier;
    writing_stage: WritingStage;
    pain_points: PainPoint[];
    prior_tools: PriorAiTool[];
};

export type LearningStylePayload = {
    preferred_time: PreferredTime;
    guidance_style: GuidanceStyle;
    feedback_verbosity: FeedbackVerbosity;
    latency_tolerance: number;
    guided_refusal_tolerance: number;
    evidence_first_tolerance: number;
};

export type ActivateRegistrationPayload = {
    token: string;
    password: string;
    confirm_password: string;
    real_name: string;
    student_id: string;
    consent_personalization: boolean;
    analytics_opt_in: boolean;
    onboarding_profile: OnboardingProfilePayload;
    learning_style: LearningStylePayload;
};
