import { useEffect, useState } from 'react';
import { Card, Form, Input, Select, Button, Radio, Typography, Space, Alert, Tag, message } from 'antd';
import { ApiOutlined, CheckCircleOutlined, DownloadOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTheme } from '@/ThemeProvider';
import { useAiConfigStore, type AiSourceMode } from '@/domains/ai/useAiConfigStore';
import { useMobile } from '@/hooks/useMobile';
import { aiConfigApi, testProviderConnection, type UpdateAIConfigRequest } from '@/api/aiConfig';

const { Title, Text } = Typography;

function toApiMode(mode: AiSourceMode): 'local' | 'server' | 'auto' {
    if (mode === 'cloud') return 'server';
    return mode;
}

function fromApiMode(mode?: string | null): AiSourceMode {
    if (mode === 'server') return 'cloud';
    if (mode === 'local') return 'local';
    return 'auto';
}

function maskFromLegacyApiKey(apiKey?: string | null): string {
    const value = apiKey?.trim();
    if (!value) return '';
    if (value.length <= 8) return '********';
    return `${value.slice(0, 3)}${'*'.repeat(Math.max(1, value.length - 7))}${value.slice(-4)}`;
}

export function AISettingsPage() {
    const [form] = Form.useForm();
    const [testLoading, setTestLoading] = useState(false);
    const isMobile = useMobile();
    const { mode, setMode } = useTheme();
    const store = useAiConfigStore();
    const isDesktopRuntime = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;

    useEffect(() => {
        aiConfigApi
            .get()
            .then((remote) => {
                const state = useAiConfigStore.getState();
                const masked = (remote as { api_key_masked?: string | null }).api_key_masked;
                state.setDefaultMode(fromApiMode(remote.default_mode));
                state.setProvider((remote.provider as 'openai' | 'anthropic' | 'custom') || 'openai');
                state.setCustomBaseUrl(remote.custom_base_url ?? '');
                state.setServerUrl(remote.server_url ?? 'http://localhost:8080');
                state.setApiKey('');
                state.setApiKeyMasked(masked ?? maskFromLegacyApiKey((remote as { api_key?: string | null }).api_key));
            })
            .catch(() => {
                // keep local persisted config as fallback when backend endpoint is unavailable
            });
    }, []);

    useEffect(() => {
        form.setFieldsValue({
            defaultMode: store.defaultMode,
            provider: store.provider,
            customBaseUrl: store.customBaseUrl,
            serverUrl: store.serverUrl,
            apiKey: '',
        });
    }, [form, store.defaultMode, store.provider, store.customBaseUrl, store.serverUrl]);

    const handleTestConnection = async () => {
        const values = await form.validateFields(['provider']);
        setTestLoading(true);
        try {
            const ok = await testProviderConnection();
            if (!ok) {
                message.error('平台后端不可达，请检查服务状态后重试');
                return;
            }

            message.success('平台后端连接正常');
            if (values.provider === 'openai' || values.provider === 'anthropic' || values.provider === 'custom') {
                message.info('Web 端仅验证平台后端连通性，模型供应商连通性需通过后端代理验证');
            }
        } catch {
            message.error('连接测试失败，请检查网络和服务状态');
        } finally {
            setTestLoading(false);
        }
    };

    const handleSave = async () => {
        const values = await form.validateFields();
        const payload: UpdateAIConfigRequest = {
            default_mode: toApiMode(values.defaultMode),
            provider: values.provider,
            custom_base_url: values.customBaseUrl ?? '',
            server_url: values.serverUrl ?? 'http://localhost:8080',
        };
        if (form.isFieldTouched('apiKey')) {
            payload.api_key = values.apiKey ?? '';
        }

        try {
            const saved = await aiConfigApi.patch(payload);
            const masked = (saved as { api_key_masked?: string | null }).api_key_masked;
            store.setDefaultMode(fromApiMode(saved.default_mode));
            store.setProvider((saved.provider as 'openai' | 'anthropic' | 'custom') || 'openai');
            store.setCustomBaseUrl(saved.custom_base_url ?? '');
            store.setServerUrl(saved.server_url ?? 'http://localhost:8080');
            store.setApiKey('');
            store.setApiKeyMasked(masked ?? maskFromLegacyApiKey((saved as { api_key?: string | null }).api_key));
            form.resetFields(['apiKey']);
            message.success('配置已保存并同步到服务器');
        } catch {
            store.setDefaultMode(values.defaultMode);
            store.setProvider(values.provider);
            store.setCustomBaseUrl(values.customBaseUrl ?? '');
            store.setServerUrl(values.serverUrl ?? 'http://localhost:8080');
            store.setApiKey('');
            message.warning('服务端保存失败，当前仅本地暂存配置');
        }
    };

    return (
        <div className="p-6 max-w-3xl mx-auto" style={{ color: isMobile ? 'var(--text-light)' : 'var(--text-dark)' }}>
            <div className="mb-6 flex items-center gap-3">
                <ApiOutlined style={{ fontSize: 24, color: 'var(--primary-500)' }} />
                <Title level={3} style={{ margin: 0 }}>
                    AI 接入配置
                </Title>
            </div>

            <Form form={form} layout="vertical" onFinish={handleSave}>
                <Card title="主题偏好" className="mb-4">
                    <Form.Item label="主题模式">
                        <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
                            <Radio.Button value="system">跟随系统</Radio.Button>
                            <Radio.Button value="light">亮色</Radio.Button>
                            <Radio.Button value="dark">暗色</Radio.Button>
                        </Radio.Group>
                    </Form.Item>
                </Card>

                <Card title="默认推理模式" className="mb-4">
                    <Form.Item name="defaultMode" noStyle>
                        <Radio.Group buttonStyle="solid">
                            <Radio.Button value="auto">智能路由（本地优先）</Radio.Button>
                            <Radio.Button value="local">仅本地</Radio.Button>
                            <Radio.Button value="cloud">仅云端</Radio.Button>
                        </Radio.Group>
                    </Form.Item>
                </Card>

                <Card title="API 与提供商" className="mb-4">
                    <Form.Item name="provider" label="提供商">
                        <Select>
                            <Select.Option value="openai">OpenAI</Select.Option>
                            <Select.Option value="anthropic">Anthropic</Select.Option>
                            <Select.Option value="custom">自定义</Select.Option>
                        </Select>
                    </Form.Item>

                    <Form.Item name="apiKey" label="API Key">
                        <Input.Password placeholder={store.apiKeyMasked ? `已保存密钥：${store.apiKeyMasked}` : 'sk-...'} />
                    </Form.Item>
                    {store.apiKeyMasked && (
                        <Text type="secondary" className="block mb-3">
                            当前已配置密钥（{store.apiKeyMasked}）。不修改该输入框时保存将保持原值。
                        </Text>
                    )}

                    <Form.Item noStyle shouldUpdate={(prev, cur) => prev.provider !== cur.provider}>
                        {({ getFieldValue }) =>
                            getFieldValue('provider') === 'custom' ? (
                                <Form.Item name="customBaseUrl" label="自定义 Base URL">
                                    <Input placeholder="https://your-api.example.com" />
                                </Form.Item>
                            ) : null
                        }
                    </Form.Item>

                    <Form.Item name="serverUrl" label="服务端地址">
                        <Input placeholder="http://localhost:8080" />
                    </Form.Item>

                    <Space>
                        <Button icon={<CheckCircleOutlined />} loading={testLoading} onClick={() => void handleTestConnection()}>
                            测试连接
                        </Button>
                    </Space>
                </Card>

                <Card title="本地模型管理" className="mb-6">
                    <Alert
                        message="Local AI（紫色）与 Workspace AI（蓝色）在界面中始终语义隔离"
                        type="info"
                        showIcon
                        className="mb-4"
                    />
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <Text strong>Qwen2.5-1.5B-GGUF-INT4</Text>
                            <br />
                            <Text type="secondary" className="text-sm">
                                1.2 GB · 桌面端可启用本地推理
                            </Text>
                        </div>
                        <Space>
                            <Tag color={store.localModelStatus === 'ready' ? 'success' : store.localModelStatus === 'error' ? 'error' : 'default'}>
                                {store.localModelStatus}
                            </Tag>
                            <Button
                                size="small"
                                type="primary"
                                icon={<DownloadOutlined />}
                                disabled
                            >
                                {isDesktopRuntime ? '桌面端能力待接入' : '仅桌面端可用'}
                            </Button>
                            <Button size="small" danger icon={<DeleteOutlined />} disabled>
                                删除能力待接入
                            </Button>
                        </Space>
                    </div>
                    <Text type="secondary">当前不再提供前端假下载进度，需通过桌面端真实 IPC 能力接入后启用。</Text>
                </Card>

                <Form.Item>
                    <Button type="primary" htmlType="submit" size="large">
                        保存配置
                    </Button>
                </Form.Item>
            </Form>
        </div>
    );
}
