import { useState } from 'react';
import {
  Play,
  Code2,
  Zap,
  Grid3X3,
  MessageCircle,
  Sparkles,
} from 'lucide-react';
import { Layout, Button, Typography, Space } from 'antd';

const { Sider, Content, Header } = Layout;
const { Title, Text } = Typography;

// Mock simulation field SVG
function SimFieldVisualization({ base64 }: { base64?: string }) {
  if (base64) {
    return (
      <img
        src={`data:image/png;base64,${base64}`}
        alt="仿真结果"
        className="max-h-full max-w-full object-contain"
      />
    );
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
  );
}

const SIM_TYPES = [
  { key: 'python', label: 'Python 代码', desc: '自定义 Python 仿真代码', icon: <Code2 size={16} /> },
  { key: 'laplace', label: 'Laplace 2D', desc: '二维拉普拉斯方程数值解', icon: <Zap size={16} /> },
  { key: 'point_charge', label: '点电荷场', desc: '点电荷系统电场分布', icon: <Grid3X3 size={16} /> },
];

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
];

function highlightLine(line: string): string {
  if (line.startsWith('#')) {
    return `<span style="color: #4ADE80">${line}</span>`;
  }
  if (line.includes('def ')) {
    return `<span style="color:#60A5FA">def</span> ${line.replace('def ', '').replace('electric_field', '<span style="color:#A78BFA">electric_field</span>')}`;
  }
  if (line.includes('np.')) {
    return line.replace(/np\./g, '<span style="color:#FCD34D">np.</span>');
  }
  return line;
}

export function WorkspacePage() {
  const [activeSim, setActiveSim] = useState('python');
  const [running, setRunning] = useState(false);
  const [showResult, setShowResult] = useState(true);
  const [modifyOpen, setModifyOpen] = useState(true);
  const [modifyInput, setModifyInput] = useState('非对称情况下的点电荷场');

  const handleRun = () => {
    setRunning(true);
    setShowResult(false);
    setTimeout(() => {
      setRunning(false);
      setShowResult(true);
    }, 2000);
  };

  return (
    <Layout style={{ height: '100vh', background: '#0D0E15', color: 'rgba(255,255,255,0.85)' }}>
      {/* Simulation Types Sub-sidebar */}
      <Sider width={260} style={{ background: '#13141F', borderRight: '1px solid #1E1F2E' }}>
        <div style={{ padding: 20 }}>
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginBottom: 16, display: 'block' }}>仿真类型</Text>
          <div className="space-y-2">
            {SIM_TYPES.map(({ key, label, desc, icon }) => {
              const isActive = activeSim === key;
              return (
                <div
                  key={key}
                  onClick={() => setActiveSim(key)}
                  className="rounded-xl p-3 cursor-pointer flex items-start gap-3 transition-colors"
                  style={{
                    backgroundColor: isActive ? 'rgba(76, 29, 149, 0.4)' : 'transparent',
                    border: isActive ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid transparent',
                  }}
                >
                  <div style={{ color: isActive ? '#C4B5FD' : 'rgba(255,255,255,0.4)', marginTop: 2 }}>{icon}</div>
                  <div>
                    <Text style={{ color: isActive ? '#E2E8F0' : 'rgba(255,255,255,0.65)', fontWeight: 500, fontSize: 14, display: 'block' }}>
                      {label}
                    </Text>
                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 4, display: 'block' }}>{desc}</Text>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Sider>

      {/* Main Content Area */}
      <Layout style={{ background: 'transparent' }}>
        {/* Header */}
        <Header style={{
          background: 'transparent',
          borderBottom: '1px solid #1E1F2E',
          padding: '0 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 80,
          lineHeight: 'normal'
        }}>
          <Space size="middle">
            <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(139, 92, 246, 0.15)' }}>
              <Grid3X3 size={20} color="#A78BFA" />
            </div>
            <div>
              <Title level={5} style={{ color: '#F8FAFC', margin: 0 }}>电磁场仿真</Title>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>支持自定义 Python 代码与预设仿真</Text>
            </div>
          </Space>
          <Space size="middle">
            <Button
              type="primary"
              onClick={handleRun}
              loading={running}
              icon={!running && <Play size={16} />}
              style={{
                background: 'linear-gradient(90deg, #8B5CF6, #6D28D9)',
                boxShadow: '0 4px 14px 0 rgba(139, 92, 246, 0.39)',
                borderColor: 'transparent',
                height: 40,
                borderRadius: 8,
                padding: '0 20px',
                fontWeight: 500
              }}
            >
              {running ? '运行中...' : '运行'}
            </Button>
            <Button
              icon={<MessageCircle size={16} />}
              style={{
                background: 'rgba(255,255,255,0.05)',
                borderColor: 'rgba(255,255,255,0.1)',
                color: '#E2E8F0',
                height: 40,
                borderRadius: 8
              }}
            >
              AI 问答
            </Button>
          </Space>
        </Header>

        {/* Scrollable Content */}
        <Content style={{ padding: 32, overflowY: 'auto', position: 'relative' }}>
          {/* Code Block */}
          <div style={{ borderRadius: 12, overflow: 'hidden', background: '#13141F', border: '1px solid #1E1F2E', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 12, borderBottom: '1px solid #1E1F2E' }}>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-xs font-medium cursor-pointer bg-[#6D28D9] hover:bg-[#7C3AED] transition-colors">
                <Sparkles size={13} /> AI 助手
              </div>
            </div>
            <div style={{ padding: 16, fontFamily: 'monospace', fontSize: 14, lineHeight: 1.6, overflowX: 'auto', color: '#E2E8F0' }}>
              <table style={{ width: '100%' }}>
                <tbody>
                  {CODE_LINES.map((line, idx) => (
                    <tr key={idx}>
                      <td style={{ width: 40, userSelect: 'none', textAlign: 'right', paddingRight: 16, verticalAlign: 'top', color: 'rgba(255,255,255,0.3)' }}>
                        {idx + 1}
                      </td>
                      <td style={{ whiteSpace: 'pre', verticalAlign: 'top' }} dangerouslySetInnerHTML={{ __html: highlightLine(line) }} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Floating AI Input */}
            {modifyOpen && (
              <div
                style={{
                  position: 'absolute',
                  left: '8%',
                  bottom: 24,
                  zIndex: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 8,
                  borderRadius: 12,
                  backgroundColor: '#0D0E15',
                  border: '1px solid #8B5CF6',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  width: '84%',
                }}
              >
                <input
                  value={modifyInput}
                  onChange={e => setModifyInput(e.target.value)}
                  style={{ flex: 1, background: 'transparent', outline: 'none', padding: '0 12px', fontFamily: 'monospace', fontSize: 14, color: '#F8FAFC', border: 'none' }}
                />
                <Button
                  type="primary"
                  onClick={() => { handleRun(); setModifyOpen(false) }}
                  icon={<Sparkles size={14} />}
                  style={{ backgroundColor: '#8B5CF6', borderColor: '#8B5CF6', borderRadius: 6 }}
                >
                  修改代码
                </Button>
                <Button
                  type="text"
                  onClick={() => setModifyOpen(false)}
                  style={{ color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.1)', borderRadius: 6 }}
                >
                  取消
                </Button>
              </div>
            )}
          </div>

          {/* Output */}
          <div style={{ marginTop: 32, marginBottom: 16 }}>
            <Text style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>&gt;_ 输出</Text>
          </div>

          {running && (
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>正在运行...</Text>
          )}
          {showResult && !running && (
            <Space direction="vertical" size="middle">
              <Text style={{ color: '#10B981', fontSize: 14 }}>仿真完成！电场方向已可视化。</Text>
              <SimFieldVisualization />
            </Space>
          )}
        </Content>
      </Layout>
    </Layout>
  );
}
