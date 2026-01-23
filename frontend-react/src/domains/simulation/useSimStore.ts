import { create } from 'zustand';
import { apiClient } from '@/lib/api-client';

interface CodeExecutionResult {
    success: boolean;
    output: string;
    error: string | null;
    plots: string[];
}

interface SimulationState {
    // Selected simulation type
    selectedType: string;
    setSelectedType: (type: string) => void;

    // Code editor state
    code: string;
    setCode: (code: string) => void;

    // Code execution state
    codeResult: CodeExecutionResult | null;
    isCodeRunning: boolean;

    // AI assist state
    isAIProcessing: boolean;
    aiPrompt: string;
    showAIPanel: boolean;
    setAIPrompt: (prompt: string) => void;
    setShowAIPanel: (show: boolean) => void;

    // Actions
    runCode: (timeout?: number) => Promise<void>;
    runAIAssist: () => Promise<void>;
    reset: () => void;
}

// Default code template
const defaultCode = `# 电磁场仿真示例代码
# 预置模块 (无需 import): np (numpy), plt (matplotlib.pyplot), math

# 创建电场可视化
x = np.linspace(-2, 2, 20)
y = np.linspace(-2, 2, 20)
X, Y = np.meshgrid(x, y)

# 点电荷位置
q1_pos = (-1, 0)
q2_pos = (1, 0)

# 计算电场 (简化模型)
def electric_field(qx, qy, X, Y, q=1):
    dx = X - qx
    dy = Y - qy
    r = np.sqrt(dx**2 + dy**2)
    r = np.where(r < 0.2, 0.2, r)  # 避免除零
    Ex = q * dx / r**3
    Ey = q * dy / r**3
    return Ex, Ey

Ex1, Ey1 = electric_field(*q1_pos, X, Y, q=1)
Ex2, Ey2 = electric_field(*q2_pos, X, Y, q=-1)
Ex, Ey = Ex1 + Ex2, Ey1 + Ey2

# 绘图
fig, ax = plt.subplots(figsize=(8, 8))
ax.streamplot(X, Y, Ex, Ey, color='cyan', linewidth=1, density=1.5)
ax.scatter(*q1_pos, color='red', s=100, label='+q')
ax.scatter(*q2_pos, color='blue', s=100, label='-q')
ax.set_xlim(-2, 2)
ax.set_ylim(-2, 2)
ax.set_aspect('equal')
ax.set_title('Electric Field Lines: Dipole')
ax.legend()
ax.set_facecolor('#1a1a2e')
fig.patch.set_facecolor('#1a1a2e')
ax.tick_params(colors='white')
ax.xaxis.label.set_color('white')
ax.yaxis.label.set_color('white')
ax.title.set_color('white')
plt.show()

print("仿真完成! 电场方向已可视化。")
`;

export const useSimStore = create<SimulationState>((set, get) => ({
    // Initial state
    selectedType: 'code',
    setSelectedType: (selectedType: string) => set({ selectedType }),
    code: defaultCode,
    codeResult: null,
    isCodeRunning: false,
    isAIProcessing: false,
    aiPrompt: '',
    showAIPanel: false,

    // Setters
    setCode: (code: string) => set({ code }),
    setAIPrompt: (aiPrompt: string) => set({ aiPrompt }),
    setShowAIPanel: (showAIPanel: boolean) => set({ showAIPanel }),

    // Run code action - continues in background when navigating away
    runCode: async (timeout = 10) => {
        set({ isCodeRunning: true, codeResult: null });
        try {
            const response = await apiClient.post<CodeExecutionResult>('/sim/run_code', {
                code: get().code,
                timeout,
            });
            set({ codeResult: response.data });
        } catch (err: any) {
            set({
                codeResult: {
                    success: false,
                    output: '',
                    error: err.message || 'Execution failed',
                    plots: [],
                },
            });
        } finally {
            set({ isCodeRunning: false });
        }
    },

    // AI assist action - continues in background
    runAIAssist: async () => {
        const { code, aiPrompt } = get();
        if (!aiPrompt.trim()) return;

        set({ isAIProcessing: true });
        try {
            const systemPrompt = `You are a Python simulation code assistant. The user is writing electromagnetic field simulation code.
Available modules (pre-imported, NO import statements needed):
- np: numpy
- plt: matplotlib.pyplot  
- math: standard math module

Modify or improve the code based on the user's request. Return ONLY the modified Python code, no explanations.`;

            const response = await apiClient.post<{ response: string }>('/ai/chat', {
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Current code:\n\`\`\`python\n${code}\n\`\`\`\n\nRequest: ${aiPrompt}` }
                ],
                stream: false,
            });

            // Extract code from response
            const responseText = response.data.response;
            const codeMatch = responseText.match(/```python\n([\s\S]*?)```/);
            if (codeMatch) {
                set({ code: codeMatch[1] });
            } else {
                set({ code: responseText });
            }
            set({ aiPrompt: '', showAIPanel: false });
        } catch (err: any) {
            // Store error but don't throw - just log
            console.error('AI assist failed:', err.message);
        } finally {
            set({ isAIProcessing: false });
        }
    },

    // Reset to initial state
    reset: () => set({
        code: defaultCode,
        codeResult: null,
        isCodeRunning: false,
        isAIProcessing: false,
        aiPrompt: '',
        showAIPanel: false,
    }),
}));
