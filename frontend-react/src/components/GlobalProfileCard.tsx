import { useState, useEffect } from 'react';
import { getGlobalProfile, type StudentGlobalProfile } from '../lib/student-api';
import { logger } from '@/lib/logger';
import './GlobalProfileCard.css';

/**
 * Props for GlobalProfileCard.
 */
interface GlobalProfileCardProps {
    /** Student ID used to load the global profile. */
    studentId: number;
    /** Optional preloaded profile to render immediately. */
    initialProfile?: StudentGlobalProfile | null;
    /** Initial error message to display. */
    initialError?: string;
    /** Whether the component should render in loading state initially. */
    initialLoading?: boolean;
    /** Disable auto-loading when the parent manages data fetching. */
    disableAutoLoad?: boolean;
    /** Optional override for the profile fetcher. */
    fetchProfile?: (studentId: number) => Promise<StudentGlobalProfile>;
}

interface ParsedCompetencies {
    [key: string]: number;
}

interface ParsedLearningStyle {
    preferred_time?: string;
    pace?: string;
    [key: string]: string | undefined;
}

// Competency display names
const COMPETENCY_NAMES: Record<string, string> = {
    academic_writing: '学术写作',
    citation: '引用规范',
    structure: '结构组织',
    logic: '逻辑连贯',
    vocabulary: '词汇丰富度',
    grammar: '语法准确性',
    critical_thinking: '批判性思维',
};

/**
 * Renders a student's cross-course learning profile card.
 *
 * @param props Component props.
 * @returns The profile card UI.
 */
export default function GlobalProfileCard({
    studentId,
    initialProfile = null,
    initialError = '',
    initialLoading,
    disableAutoLoad = false,
    fetchProfile,
}: GlobalProfileCardProps) {
    const [profile, setProfile] = useState<StudentGlobalProfile | null>(initialProfile);
    const [loading, setLoading] = useState(initialLoading ?? !initialProfile);
    const [error, setError] = useState(initialError);

    useEffect(() => {
        if (disableAutoLoad) return;
        let active = true;
        const loadProfile = async () => {
            setLoading(true);
            try {
                const fetcher = fetchProfile ?? getGlobalProfile;
                const data = await fetcher(studentId);
                if (!active) return;
                setProfile(data);
            } catch (err) {
                if (!active) return;
                setError('加载档案失败');
                logger.error('global profile load failed', { error: err });
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };

        loadProfile();
        return () => {
            active = false;
        };
    }, [studentId, disableAutoLoad, fetchProfile]);

    if (loading) {
        return (
            <div className="global-profile-card loading">
                <div className="loading-spinner" />
                加载中...
            </div>
        );
    }

    if (error || !profile) {
        return (
            <div className="global-profile-card error">
                {error || '暂无档案数据'}
            </div>
        );
    }

    // Parse JSON strings
    let competencies: ParsedCompetencies = {};
    let learningStyle: ParsedLearningStyle = {};

    try {
        competencies = JSON.parse(profile.global_competencies || '{}');
    } catch { /* empty */ }

    try {
        learningStyle = JSON.parse(profile.learning_style || '{}');
    } catch { /* empty */ }

    const competencyEntries = Object.entries(competencies).sort((a, b) => b[1] - a[1]);

    return (
        <div className="global-profile-card">
            <div className="card-header">
                <h3>📊 学习档案</h3>
                <span className="badge">跨课程</span>
            </div>

            {/* Study Time */}
            <div className="stat-section">
                <div className="stat-item highlight">
                    <span className="stat-value">{profile.total_study_hours}</span>
                    <span className="stat-label">累计学时</span>
                </div>
            </div>

            {/* Competencies */}
            {competencyEntries.length > 0 && (
                <div className="competencies-section">
                    <h4>能力画像</h4>
                    <div className="competencies-list">
                        {competencyEntries.map(([key, value]) => (
                            <div key={key} className="competency-item">
                                <div className="competency-header">
                                    <span className="competency-name">
                                        {COMPETENCY_NAMES[key] || key}
                                    </span>
                                    <span className="competency-score">
                                        {Math.round(value * 100)}%
                                    </span>
                                </div>
                                <div className="competency-bar">
                                    <div
                                        className="competency-fill"
                                        style={{ width: `${value * 100}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Learning Style */}
            {Object.keys(learningStyle).length > 0 && (
                <div className="style-section">
                    <h4>学习特征</h4>
                    <div className="style-tags">
                        {learningStyle.preferred_time && (
                            <span className="style-tag">
                                🕐 {learningStyle.preferred_time === 'morning' ? '晨间学习' :
                                    learningStyle.preferred_time === 'evening' ? '夜间学习' : '下午学习'}
                            </span>
                        )}
                        {learningStyle.pace && (
                            <span className="style-tag">
                                🚀 {learningStyle.pace === 'fast' ? '快节奏' :
                                    learningStyle.pace === 'slow' ? '稳扎稳打' : '中等节奏'}
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Updated Time */}
            {profile.updated_at && (
                <div className="updated-time">
                    更新于 {new Date(profile.updated_at).toLocaleDateString('zh-CN')}
                </div>
            )}
        </div>
    );
}
