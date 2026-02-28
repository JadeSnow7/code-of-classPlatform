import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Typography, Image, Space, Input, Select, Card } from 'antd';
import {
  PlayCircleOutlined,
  CodeOutlined,
  ThunderboltOutlined,
  MessageOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { useMobile } from '@/hooks/useMobile';
import { useWorkspaceSimulation } from '@/hooks/useWorkspaceSimulation';

const { Title, Text } = Typography;
const { TextArea } = Input;

const DEFAULT_CODE_SNIPPET = `# 实验仿真示例代码
x = np.linspace(-2, 2, 20)
y = np.linspace(-2, 2, 20)
X, Y = np.meshgrid(x, y)

# 在此编写仿真逻辑
result = np.sin(X) * np.cos(Y)`;

function SimFieldVisualization({ base64 }: { base64?: string }) {
  if (base64) {
    return (
      <Image
        src={`data:image/png;base64,${base64}`}
        alt="仿真结果"
        style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
        preview={false}
      />
    );
  }

  return (
    <div className="rounded-lg overflow-hidden border mt-4" style={{ borderColor: 'var(--surface-700)', display: 'inline-block' }}>
      <div className="w-[400px] h-[260px] flex items-center justify-center" style={{ backgroundColor: '#0B0F19' }}>
        <Text style={{ color: 'rgba(255,255,255,0.6)' }}>运行后显示后端返回结果</Text>
      </div>
    </div>
  );
}

export default function WorkspaceHubPage() {
  const navigate = useNavigate();
  const isMobile = useMobile();
  const [activeSim, setActiveSim] = useState('python');
  const [code, setCode] = useState(DEFAULT_CODE_SNIPPET);
  const [gridResolution, setGridResolution] = useState<'coarse' | 'medium' | 'fine'>('coarse');
  const [boundaryCondition, setBoundaryCondition] = useState<'pec' | 'pml' | 'periodic'>('pec');
  const [frequencyMhz, setFrequencyMhz] = useState<number | null>(null);
  const { running, showResult, resultBase64, statusText, errorMessage, runSimulation } = useWorkspaceSimulation();

  const canRun = useMemo(() => code.trim().length > 0, [code]);

  const handleRun = () => {
    if (!canRun) return;
    const params: Record<string, unknown> = {
      grid_resolution: gridResolution,
      boundary_condition: boundaryCondition,
    };
    if (frequencyMhz !== null && Number.isFinite(frequencyMhz)) {
      params.frequency_mhz = frequencyMhz;
    }

    void runSimulation({
      simulationType: activeSim,
      code,
      params,
    });
  };

  const simulationTypes = [
    { id: 'python', label: 'Python 代码', desc: '自定义 Python 仿真代码', icon: <CodeOutlined /> },
    { id: 'laplace', label: 'Laplace 2D', desc: '二维拉普拉斯方程数值解', icon: <ThunderboltOutlined /> },
    { id: 'point_charge', label: '示例场景', desc: '网格数据可视化示例', icon: <AppstoreOutlined /> },
  ];

  if (isMobile) {
    return (
      <div className="p-4 flex items-center justify-center h-full" style={{ backgroundColor: 'var(--surface-950)' }}>
        <Text style={{ color: 'var(--text-muted)' }}>移动端暂不支持高级仿真工作台，请使用桌面端。</Text>
      </div>
    );
  }

  return (
    <div className="h-full flex text-sm" style={{ backgroundColor: '#0D0E15', color: 'rgba(255,255,255,0.85)' }}>
      <div className="w-64 flex-shrink-0 border-r flex flex-col" style={{ borderColor: '#1E1F2E', backgroundColor: '#13141F' }}>
        <div className="p-5">
          <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, display: 'block', marginBottom: 16 }}>仿真类型</Text>
          <div className="space-y-2">
            {simulationTypes.map((item) => {
              const isActive = activeSim === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => setActiveSim(item.id)}
                  className="rounded-xl p-3 cursor-pointer transition-colors flex items-start gap-3"
                  style={{
                    backgroundColor: isActive ? 'rgba(76, 29, 149, 0.4)' : 'transparent',
                    border: isActive ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid transparent',
                  }}
                >
                  <div style={{ color: isActive ? '#C4B5FD' : 'rgba(255,255,255,0.45)', marginTop: 2, fontSize: 16 }}>
                    {item.icon}
                  </div>
                  <div>
                    <Text strong style={{ color: isActive ? '#E2E8F0' : 'rgba(255,255,255,0.65)', display: 'block' }}>{item.label}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{item.desc}</Text>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 py-5 border-b" style={{ borderColor: '#1E1F2E' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(139, 92, 246, 0.15)' }}>
              <AppstoreOutlined style={{ color: '#A78BFA', fontSize: 20 }} />
            </div>
            <div>
              <Title level={4} style={{ color: '#F8FAFC', margin: 0, fontWeight: 500 }}>实验仿真</Title>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>提交真实参数与代码到后端执行</Text>
            </div>
          </div>
          <Space size="middle">
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              size="large"
              onClick={handleRun}
              loading={running}
              disabled={!canRun}
              style={{
                background: 'linear-gradient(90deg, #8B5CF6, #6D28D9)',
                border: 'none',
                padding: '0 24px',
                borderRadius: 8,
                boxShadow: '0 4px 14px 0 rgba(139, 92, 246, 0.39)',
              }}
            >
              运行
            </Button>
            <Button
              icon={<MessageOutlined />}
              size="large"
              onClick={() => navigate('/local-ai')}
              style={{
                backgroundColor: 'rgba(255,255,255,0.05)',
                borderColor: 'rgba(255,255,255,0.1)',
                color: '#E2E8F0',
                borderRadius: 8,
              }}
            >
              AI 问答
            </Button>
          </Space>
        </div>

        <div className="flex-1 overflow-y-auto p-8 relative space-y-6">
          <Card
            styles={{ body: { padding: 16 } }}
            style={{ backgroundColor: '#13141F', borderColor: '#1E1F2E' }}
          >
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Grid Resolution</Text>
                <Select
                  value={gridResolution}
                  onChange={(value) => setGridResolution(value)}
                  style={{ width: '100%', marginTop: 8 }}
                  options={[
                    { label: 'coarse', value: 'coarse' },
                    { label: 'medium', value: 'medium' },
                    { label: 'fine', value: 'fine' },
                  ]}
                />
              </div>
              <div>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Boundary</Text>
                <Select
                  value={boundaryCondition}
                  onChange={(value) => setBoundaryCondition(value)}
                  style={{ width: '100%', marginTop: 8 }}
                  options={[
                    { label: 'pec', value: 'pec' },
                    { label: 'pml', value: 'pml' },
                    { label: 'periodic', value: 'periodic' },
                  ]}
                />
              </div>
              <div>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Frequency (MHz)</Text>
                <Input
                  type="number"
                  value={frequencyMhz === null ? '' : frequencyMhz}
                  onChange={(event) => {
                    const raw = event.target.value.trim();
                    setFrequencyMhz(raw ? Number(raw) : null);
                  }}
                  style={{ marginTop: 8 }}
                  placeholder="可选"
                />
              </div>
            </div>

            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Simulation Code</Text>
            <TextArea
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoSize={{ minRows: 14, maxRows: 28 }}
              style={{
                marginTop: 8,
                backgroundColor: '#0D0E15',
                borderColor: '#1E1F2E',
                color: '#E2E8F0',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            />
          </Card>

          <div className="mt-8 mb-4 flex items-center">
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', fontSize: 13 }}>&gt;_ 输出</Text>
          </div>

          {showResult ? (
            <div className="space-y-4">
              <Text style={{ color: '#10B981', display: 'block', fontSize: 14 }}>仿真完成！结果已可视化。</Text>
              <SimFieldVisualization base64={resultBase64} />
            </div>
          ) : (
            <div className="space-y-4">
              {running ? (
                <Text style={{ color: 'rgba(255,255,255,0.4)', display: 'block', fontSize: 14 }}>
                  正在运行...{statusText ? `（${statusText}）` : ''}
                </Text>
              ) : null}
              {errorMessage ? (
                <Text style={{ color: '#f59e0b', display: 'block', fontSize: 14 }}>{errorMessage}</Text>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
