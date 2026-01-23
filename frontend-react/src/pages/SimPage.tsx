import { useSimulation } from '@/domains/simulation/useSimulation';
import { useSimStore } from '@/domains/simulation/useSimStore';
import { Atom, Play, Loader2, AlertCircle, Code2, Zap, Terminal, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import Editor from '@monaco-editor/react';

const simTypes = [
    { id: 'code', label: 'Python 代码', description: '自定义 Python 仿真代码', icon: Code2 },
    { id: 'laplace', label: 'Laplace 2D', description: '二维拉普拉斯方程数值解', icon: Zap },
    { id: 'charges', label: '点电荷场', description: '点电荷系统电场分布', icon: Atom },
];


export function SimPage() {
    const { status, result, error, runLaplace2D, runPointCharges, reset } = useSimulation();
    const {
        selectedType,
        setSelectedType,
        code,
        setCode,
        codeResult,
        isCodeRunning,
        isAIProcessing,
        aiPrompt,
        setAIPrompt,
        showAIPanel,
        setShowAIPanel,
        runCode,
        runAIAssist,
    } = useSimStore();

    const handleRunSim = () => {
        reset();
        const params = { boundary: 'dirichlet', grid: [100, 100] as [number, number] };
        switch (selectedType) {
            case 'laplace':
                runLaplace2D(params);
                break;
            case 'charges':
                runPointCharges(params);
                break;
        }
    };

    const handleRun = () => {
        if (selectedType === 'code') {
            runCode();
        } else {
            handleRunSim();
        }
    };

    const isRunning = isCodeRunning || status === 'running';

    return (
        <div className="h-screen flex flex-col bg-gray-950">
            {/* Header */}
            <header className="px-6 py-4 border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold text-white flex items-center gap-2">
                        <Atom className="w-6 h-6 text-purple-400" />
                        电磁场仿真
                    </h1>
                    <p className="text-sm text-gray-400 mt-1">支持自定义 Python 代码与预设仿真</p>
                </div>
                <button
                    onClick={handleRun}
                    disabled={isRunning}
                    className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-purple-500/20"
                >
                    {isRunning ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            运行中...
                        </>
                    ) : (
                        <>
                            <Play className="w-5 h-5" />
                            运行
                        </>
                    )}
                </button>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar */}
                <div className="w-64 border-r border-gray-800 p-4 bg-gray-900/50">
                    <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">仿真类型</h3>
                    <div className="space-y-1">
                        {simTypes.map((type) => (
                            <button
                                key={type.id}
                                onClick={() => setSelectedType(type.id)}
                                className={clsx(
                                    'w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-3',
                                    selectedType === type.id
                                        ? 'bg-purple-600/20 text-purple-300'
                                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                )}
                            >
                                <type.icon className="w-4 h-4" />
                                <div>
                                    <div className="text-sm font-medium">{type.label}</div>
                                    <div className="text-xs text-gray-500">{type.description}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {selectedType === 'code' ? (
                        <>
                            {/* Code Editor */}
                            <div className="flex-1 min-h-0 relative">
                                <Editor
                                    height="100%"
                                    defaultLanguage="python"
                                    theme="vs-dark"
                                    value={code}
                                    onChange={(value) => setCode(value || '')}
                                    options={{
                                        fontSize: 14,
                                        minimap: { enabled: false },
                                        padding: { top: 16 },
                                        scrollBeyondLastLine: false,
                                        automaticLayout: true,
                                    }}
                                />
                                {/* AI Assist Button */}
                                <button
                                    onClick={() => setShowAIPanel(!showAIPanel)}
                                    className="absolute top-3 right-3 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 shadow-lg"
                                >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    AI 助手
                                </button>
                                {/* AI Input Panel */}
                                {showAIPanel && (
                                    <div className="absolute bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur border-t border-gray-700 p-4">
                                        <div className="flex gap-3">
                                            <input
                                                type="text"
                                                value={aiPrompt}
                                                onChange={(e) => setAIPrompt(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && runAIAssist()}
                                                placeholder="描述你想要的修改，例如：添加磁场可视化、修改颜色方案..."
                                                className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder-gray-500"
                                                disabled={isAIProcessing}
                                            />
                                            <button
                                                onClick={runAIAssist}
                                                disabled={isAIProcessing || !aiPrompt.trim()}
                                                className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
                                            >
                                                {isAIProcessing ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Sparkles className="w-4 h-4" />
                                                )}
                                                修改代码
                                            </button>
                                            <button
                                                onClick={() => setShowAIPanel(false)}
                                                className="px-3 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
                                            >
                                                取消
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            {/* Output Panel */}
                            <div className="h-64 border-t border-gray-800 bg-gray-900 flex flex-col">
                                <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-2">
                                    <Terminal className="w-4 h-4 text-gray-500" />
                                    <span className="text-sm text-gray-400">输出</span>
                                </div>
                                <div className="flex-1 overflow-auto p-4 font-mono text-sm">
                                    {codeResult ? (
                                        <>
                                            {codeResult.error && (
                                                <pre className="text-red-400 whitespace-pre-wrap mb-2">{codeResult.error}</pre>
                                            )}
                                            {codeResult.output && (
                                                <pre className="text-green-400 whitespace-pre-wrap">{codeResult.output}</pre>
                                            )}
                                            {codeResult.plots.length > 0 && (
                                                <div className="flex gap-4 mt-4 flex-wrap">
                                                    {codeResult.plots.map((plot: string, i: number) => (
                                                        <img
                                                            key={i}
                                                            src={`data:image/png;base64,${plot}`}
                                                            alt={`Plot ${i + 1}`}
                                                            className="max-h-48 rounded-lg border border-gray-700"
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                            {codeResult.success && !codeResult.output && codeResult.plots.length === 0 && (
                                                <span className="text-gray-500">执行成功 (无输出)</span>
                                            )}
                                        </>
                                    ) : (
                                        <span className="text-gray-600">运行代码以查看输出...</span>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        /* Preset Simulation Result */
                        <div className="flex-1 flex items-center justify-center p-6">
                            {status === 'idle' && !result && (
                                <div className="text-center text-gray-500">
                                    <Atom className="w-16 h-16 mx-auto mb-4 opacity-30" />
                                    <p>点击运行按钮开始仿真</p>
                                </div>
                            )}

                            {status === 'running' && (
                                <div className="text-center">
                                    <Loader2 className="w-12 h-12 animate-spin text-purple-500 mx-auto mb-4" />
                                    <p className="text-gray-400">正在计算...</p>
                                </div>
                            )}

                            {error && (
                                <div className="text-center text-red-400">
                                    <AlertCircle className="w-12 h-12 mx-auto mb-4" />
                                    <p>{error}</p>
                                </div>
                            )}

                            {result && (
                                <div className="bg-gray-800 rounded-2xl p-4 border border-gray-700">
                                    <img
                                        src={`data:image/png;base64,${result.png_base64}`}
                                        alt="Simulation result"
                                        className="max-w-full max-h-[60vh] rounded-lg"
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

