import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getWritingSubmissions, getWritingStats, type WritingSubmission, getWritingTypeName } from '@/lib/student-api';
import { logger } from '@/lib/logger';
import './TeacherWritingDashboard.css';

interface WeaknessStat {
    name: string;
    count: number;
}

export default function TeacherWritingDashboard() {
    const { courseId } = useParams<{ courseId: string }>();
    const navigate = useNavigate();

    const [submissions, setSubmissions] = useState<WritingSubmission[]>([]);
    const [stats, setStats] = useState<{ weakness_stats: WeaknessStat[]; student_count: number } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!courseId) return;

        const loadData = async () => {
            try {
                const [subsData, statsData] = await Promise.all([
                    getWritingSubmissions(parseInt(courseId)),
                    getWritingStats(parseInt(courseId))
                ]);
                setSubmissions(subsData);
                setStats(statsData);
            } catch (err) {
                logger.error('failed to load writing dashboard data', { error: err, courseId });
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [courseId]);

    const handleViewSubmission = (id: number) => {
        navigate(`/courses/${courseId}/writing/${id}`);
    };

    if (loading) {
        return <div className="loading-spinner">加载中...</div>;
    }

    // Sort stats by count desc
    const sortedStats = stats?.weakness_stats.sort((a, b) => b.count - a.count) || [];
    const maxCount = sortedStats[0]?.count || 1;

    return (
        <div className="teacher-writing-dashboard">
            <header className="dashboard-header">
                <h1>✍️ 写作教学分析</h1>
                <p>概览全班写作表现与共性问题</p>
            </header>

            <div className="dashboard-grid">
                {/* Left Column: Weakness Analysis */}
                <div className="dashboard-card weakness-card">
                    <h3>班级薄弱点分布</h3>
                    <div className="chart-container">
                        {sortedStats.length === 0 ? (
                            <p className="empty-chart">暂无数据</p>
                        ) : (
                            sortedStats.map((stat) => (
                                <div key={stat.name} className="chart-row">
                                    <div className="row-label">{stat.name}</div>
                                    <div className="row-bar-container">
                                        <div
                                            className="row-bar"
                                            style={{ width: `${(stat.count / maxCount) * 100}%` }}
                                        />
                                    </div>
                                    <div className="row-value">{stat.count}</div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Right Column: Recent Submissions */}
                <div className="dashboard-card submissions-card">
                    <h3>🔍 最新提交</h3>
                    <div className="submissions-list">
                        {submissions.length === 0 ? (
                            <p className="empty-list">暂无提交记录</p>
                        ) : (
                            submissions.slice(0, 10).map((sub) => (
                                <div
                                    key={sub.id}
                                    className="submission-item"
                                    onClick={() => handleViewSubmission(sub.id)}
                                >
                                    <div className="sub-info">
                                        <span className="student-id">#{sub.student_id}</span>
                                        <span className="sub-title">{sub.title}</span>
                                    </div>
                                    <div className="sub-meta">
                                        <span className="sub-type">{getWritingTypeName(sub.writing_type)}</span>
                                        <span className="sub-date">
                                            {new Date(sub.created_at).toLocaleDateString('zh-CN')}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
