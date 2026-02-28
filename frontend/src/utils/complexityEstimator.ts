/**
 * 复杂度评估器
 * 根据输入内容评估推理复杂度，用于智能路由决策
 */

import type { InferenceRequest, ComplexityResult, InferenceSource } from '@classplatform/shared';

/** 复杂任务关键词 */
const COMPLEX_KEYWORDS = [
    '分析', '比较', '评估', '改进建议', '写作', '论文', '综述',
    '解释原理', '推导', '证明', '设计方案', '优化',
    'analyze', 'compare', 'evaluate', 'improve', 'explain why',
];

/** 隐私敏感关键词 */
const PRIVACY_KEYWORDS = [
    '密码', '账号', '个人', '私密', '成绩', '学号', '身份证',
    '手机号', '地址', '银行', '信用卡',
    'password', 'account', 'personal', 'private', 'secret',
];

/** 简单任务关键词 */
const SIMPLE_KEYWORDS = [
    '是什么', '什么是', '定义', '解释', '翻译',
    'what is', 'define', 'translate', 'explain',
];

/**
 * 评估请求的复杂度
 */
export function estimateComplexity(request: InferenceRequest): ComplexityResult {
    const factors: string[] = [];
    let score = 0;

    const lastMessage = request.messages[request.messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
        return { score: 0.5, factors: ['无用户消息'], suggestedSource: 'cloud' };
    }

    const content = lastMessage.content.toLowerCase();

    // 因素 1: 消息长度
    if (content.length > 500) {
        score += 0.2;
        factors.push('长文本输入');
    } else if (content.length < 50) {
        score -= 0.1;
        factors.push('短文本');
    }

    // 因素 2: 需要知识库
    if (request.useKnowledgeBase) {
        score += 0.3;
        factors.push('需要知识库检索');
    }

    // 因素 3: 复杂任务关键词
    const hasComplexKeyword = COMPLEX_KEYWORDS.some(kw => content.includes(kw.toLowerCase()));
    if (hasComplexKeyword) {
        score += 0.3;
        factors.push('专业任务');
    }

    // 因素 4: 简单任务关键词
    const hasSimpleKeyword = SIMPLE_KEYWORDS.some(kw => content.includes(kw.toLowerCase()));
    if (hasSimpleKeyword) {
        score -= 0.2;
        factors.push('简单问答');
    }

    // 因素 5: 对话轮次
    if (request.messages.length > 6) {
        score += 0.1;
        factors.push('长对话上下文');
    }

    // 因素 6: 隐私关键词（降低分数，倾向本地）
    const hasPrivacyKeyword = PRIVACY_KEYWORDS.some(kw => content.includes(kw.toLowerCase()));
    if (hasPrivacyKeyword) {
        score -= 0.5;
        factors.push('隐私敏感');
    }

    // 因素 7: 关联课程（倾向云端，可用课程知识库）
    if (request.courseId) {
        score += 0.15;
        factors.push('课程相关');
    }

    // 限制在 0-1 范围
    score = Math.max(0, Math.min(1, score));

    // 决策来源
    let suggestedSource: InferenceSource;
    if (hasPrivacyKeyword) {
        suggestedSource = 'local'; // 隐私强制本地
    } else if (score < 0.3) {
        suggestedSource = 'local';
    } else if (score > 0.7) {
        suggestedSource = 'cloud';
    } else {
        suggestedSource = 'hybrid';
    }

    return { score, factors, suggestedSource };
}

/**
 * 检测是否包含隐私敏感内容
 */
export function containsPrivacyInfo(content: string): boolean {
    const lowerContent = content.toLowerCase();
    return PRIVACY_KEYWORDS.some(kw => lowerContent.includes(kw.toLowerCase()));
}
