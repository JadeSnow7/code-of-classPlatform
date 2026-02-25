import { useState } from 'react'
import {
  Play,
  Code2,
  Zap,
  Grid3X3,
  MessageCircle,
  Sparkles,
  Square,
} from 'lucide-react'

// Mock simulation field SVG
function SimFieldVisualization({ base64 }: { base64?: string }) {
  if (base64) {
    return (
      <img
        src={`data:image/png;base64,${base64}`}
        alt="仿真结果"
        className="max-h-full max-w-full object-contain"
      />
    )
  }
  return (
    <div className="rounded-lg overflow-hidden border border-[#1E1F2E] inline-block mt-4">
      <svg viewBox="0 0 400 300" width="400" height="300" style={{ backgroundColor: '#0B0F19' }}>
        <defs>
          <linearGradient id="fieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0F172A" />
            <stop offset="50%" stopColor="#1E1B4B" />
            <stop offset="100%" stopColor="#0F172A" />
          </linearGradient>
        </defs>
        <rect width="400" height="300" fill="url(#fieldGrad)" />
        {[...Array(20)].map((_, i) => (
          <path key={i} d={`M 150 150 Q 200 ${i * 15} 250 150`} stroke="#00C2FF" strokeWidth="1" fill="none" opacity="0.6" />
        ))}
        {[...Array(20)].map((_, i) => (
          <path key={`b${i}`} d={`M 150 150 Q 100 ${i * 15} 50 150`} stroke="#00C2FF" strokeWidth="1" fill="none" opacity="0.6" />
        ))}
        {[...Array(20)].map((_, i) => (
          <path key={`c${i}`} d={`M 250 150 Q 300 ${i * 15} 350 150`} stroke="#00C2FF" strokeWidth="1" fill="none" opacity="0.6" />
        ))}
        <circle cx="150" cy="150" r="4" fill="#EF4444" />
        <circle cx="250" cy="150" r="4" fill="#EF4444" />
        <text x="200" y="22" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="11">
          Electric Field Lines: Dipole
        </text>
      </svg>
    </div>
  )
}

const SIM_TYPES = [
  { id: 'python', label: 'Python 代码', desc: '自定义 Python 仿真代码', Icon: Code2 },
  { id: 'laplace', label: 'Laplace 2D', desc: '二维拉普拉斯方程数值解', Icon: Zap },
  { id: 'point_charge', label: '点电荷场', desc: '点电荷系统电场分布', Icon: Grid3X3 },
]

const CODE_LINES = [
  '# 电磁场仿真示例代码',
  '# 预置模块 (无需 import): np (numpy), plt (matplotlib.pyplot), math',
  '',
  '# 创建电场可视化',
  'x = np.linspace(-2, 2, 20)',
  'y = np.linspace(-2, 2, 20)',
  'X, Y = np.meshgrid(x, y)',
  '',
  '# 点电荷位置',
  'q1_pos = (-1, 0)',
  'q2_pos = (1, 0)',
  '',
  '# 计算电场 (简化模型)',
  'def electric_field(qx, qy, X, Y, q=1):',
  '    dx = X - qx',
  '    dy = Y - qy',
]

function highlightLine(line: string): string {
  if (line.startsWith('#')) {
    return `<span style="color: #4ADE80">${line}</span>`
  }
  if (line.includes('def ')) {
    return `<span style="color:#60A5FA">def</span> ${line.replace('def ', '').replace('electric_field', '<span style="color:#A78BFA">electric_field</span>')}`
  }
  if (line.includes('np.')) {
    return line.replace(/np\./g, '<span style="color:#FCD34D">np.</span>')
  }
  return line
}

export function WorkspacePage() {
  const [activeSim, setActiveSim] = useState('python')
  const [running, setRunning] = useState(false)
  const [showResult, setShowResult] = useState(true)
  const [modifyOpen, setModifyOpen] = useState(true)
  const [modifyInput, setModifyInput] = useState('非对称情况下的点电荷场')

  const handleRun = () => {
    setRunning(true)
    setShowResult(false)
    setTimeout(() => {
      setRunning(false)
      setShowResult(true)
    }, 2000)
  }

  return (
    <div className="h-full flex text-sm" style={{ backgroundColor: '#0D0E15', color: 'rgba(255,255,255,0.85)' }}>
      {/* Simulation Types Sub-sidebar */}
      <div
        className="w-64 flex-shrink-0 border-r flex flex-col"
        style={{ borderColor: '#1E1F2E', backgroundColor: '#13141F' }}
      >
        <div className="p-5">
          <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>仿真类型</p>
          <div className="space-y-2">
            {SIM_TYPES.map(({ id, label, desc, Icon }) => {
              const isActive = activeSim === id
              return (
                <div
                  key={id}
                  onClick={() => setActiveSim(id)}
                  className="rounded-xl p-3 cursor-pointer flex items-start gap-3 transition-colors"
                  style={{
                    backgroundColor: isActive ? 'rgba(76, 29, 149, 0.4)' : 'transparent',
                    border: isActive ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid transparent',
                  }}
                >
                  <Icon
                    size={16}
                    style={{ color: isActive ? '#C4B5FD' : 'rgba(255,255,255,0.4)', marginTop: 2 }}
                  />
                  <div>
                    <p className="font-medium text-sm" style={{ color: isActive ? '#E2E8F0' : 'rgba(255,255,255,0.65)' }}>
                      {label}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{desc}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center justify-between px-8 py-5 border-b"
          style={{ borderColor: '#1E1F2E' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(139, 92, 246, 0.15)' }}>
              <Grid3X3 size={20} color="#A78BFA" />
            </div>
            <div>
              <h2 className="font-medium text-base" style={{ color: '#F8FAFC' }}>电磁场仿真</h2>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>支持自定义 Python 代码与预设仿真</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRun}
              disabled={running}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-white font-medium transition-opacity disabled:opacity-70"
              style={{
                background: 'linear-gradient(90deg, #8B5CF6, #6D28D9)',
                boxShadow: '0 4px 14px 0 rgba(139, 92, 246, 0.39)',
              }}
            >
              {running ? <Square size={16} /> : <Play size={16} />}
              {running ? '运行中...' : '运行'}
            </button>
            <button
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm"
              style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#E2E8F0' }}
            >
              <MessageCircle size={16} />
              AI 问答
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-8 relative">
          {/* Code Block */}
          <div className="rounded-xl overflow-hidden relative" style={{ backgroundColor: '#13141F', border: '1px solid #1E1F2E' }}>
            <div className="flex justify-end p-3 border-b border-[#1E1F2E]">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-xs font-medium cursor-pointer bg-[#6D28D9] hover:bg-[#7C3AED] transition-colors">
                <Sparkles size={13} /> AI 助手
              </div>
            </div>
            <div className="p-4 font-mono text-sm leading-relaxed overflow-x-auto" style={{ color: '#E2E8F0' }}>
              <table className="w-full">
                <tbody>
                  {CODE_LINES.map((line, idx) => (
                    <tr key={idx}>
                      <td className="w-10 select-none text-right pr-4 align-top" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        {idx + 1}
                      </td>
                      <td className="whitespace-pre align-top" dangerouslySetInnerHTML={{ __html: highlightLine(line) }} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Floating AI Input */}
            {modifyOpen && (
              <div
                className="absolute left-[8%] bottom-6 z-10 flex items-center gap-3 p-2 rounded-xl"
                style={{
                  backgroundColor: '#0D0E15',
                  border: '1px solid #8B5CF6',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  width: '84%',
                }}
              >
                <input
                  value={modifyInput}
                  onChange={e => setModifyInput(e.target.value)}
                  className="flex-1 bg-transparent outline-none px-3 font-mono text-sm"
                  style={{ color: '#F8FAFC' }}
                />
                <button
                  onClick={() => { handleRun(); setModifyOpen(false) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-sm font-medium"
                  style={{ backgroundColor: '#8B5CF6' }}
                >
                  <Sparkles size={14} /> 修改代码
                </button>
                <button
                  onClick={() => setModifyOpen(false)}
                  className="px-3 py-1.5 rounded-md text-sm"
                  style={{ color: 'rgba(255,255,255,0.6)', backgroundColor: 'rgba(255,255,255,0.1)' }}
                >
                  取消
                </button>
              </div>
            )}
          </div>

          {/* Output */}
          <div className="mt-8 mb-4">
            <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>&gt;_ 输出</span>
          </div>

          {running && (
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>正在运行...</p>
          )}
          {showResult && !running && (
            <div className="space-y-4">
              <p className="text-sm" style={{ color: '#10B981' }}>仿真完成！电场方向已可视化。</p>
              <SimFieldVisualization />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
