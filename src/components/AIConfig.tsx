import { Form, Input, Button, message, Space } from 'antd';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { t } from '../i18n';

interface AIConfigProps {
    onSave: () => void;
}

const glassStyle = {
    background: 'var(--glass-solid)',
    backdropFilter: 'blur(12px)',
    border: 'var(--mist-border)',
    borderRadius: '8px',
};

export default function AIConfig({ onSave }: AIConfigProps) {
    const [form] = Form.useForm();
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        const loadConfig = async () => {
            try {
                const electron = window.require ? window.require('electron') : null;
                if (!electron) {
                    return;
                }

                const result = await electron.ipcRenderer.invoke('db:getAIConfig');
                if (result.success && result.data) {
                    form.setFieldsValue(result.data);
                }
            } catch (error: any) {
                message.error(`${t('config.loadingError')}: ${error.message}`);
            }
        };

        loadConfig();
    }, [form]);

    const handleSubmit = async (values: any) => {
        try {
            const electron = window.require ? window.require('electron') : null;
            if (!electron) {
                message.error('Electron context not found');
                return;
            }

            const result = await electron.ipcRenderer.invoke('db:saveAIConfig', values);
            if (!result.success) {
                message.error(`${t('config.savingError')}: ${result.error}`);
                return;
            }

            message.success(t('config.saveSuccess'));
            onSave();
        } catch (error: any) {
            message.error(`${t('config.savingError')}: ${error.message}`);
        }
    };

    const handleTest = async () => {
        try {
            const values = await form.validateFields();
            setTesting(true);

            const baseUrl = values.apiUrl.replace(/\/$/, "");
            const endpoint = baseUrl.endsWith('/v1') || baseUrl.includes('/chat/completions')
                ? baseUrl.replace('/chat/completions', '/models')
                : `${baseUrl}/v1/models`;

            // We use /models as a lightweight test for OpenAI compat endpoints
            const response = await axios.get(endpoint, {
                headers: {
                    'Authorization': `Bearer ${values.apiKey}`
                }
            });

            if (response.status === 200) {
                message.success(t('config.connectionSuccess'));
            } else {
                message.error(`${t('config.connectionError')}: ${response.status}`);
            }
        } catch (error: any) {
            console.error("Test error:", error.response?.data || error);
            message.error(`${t('config.connectionError')}: ${error.response?.data?.error?.message || error.message}`);
        } finally {
            setTesting(false);
        }
    };

    return (
        <div style={{ ...glassStyle, padding: '20px' }}>
            <Form form={form} layout="vertical" onFinish={handleSubmit}>
                <Form.Item
                    label={t('config.apiUrl')}
                    name="apiUrl"
                    rules={[{ required: true, message: t('config.apiUrlRequired') }]}
                >
                    <Input
                        placeholder="e.g. https://api.openai.com/v1"
                        style={{ borderRadius: '6px', background: 'var(--doc-surface)' }}
                    />
                </Form.Item>
                <Form.Item
                    label={t('config.apiKey')}
                    name="apiKey"
                    rules={[{ required: true, message: t('config.apiKeyRequired') }]}
                >
                    <Input.Password
                        placeholder="sk-..."
                        style={{ borderRadius: '6px', background: 'var(--doc-surface)' }}
                    />
                </Form.Item>
                <Form.Item
                    label={t('config.modelName')}
                    name="modelName"
                    rules={[{ required: true, message: t('config.modelNameRequired') }]}
                >
                    <Input
                        placeholder="e.g. gpt-4"
                        style={{ borderRadius: '6px', background: 'var(--doc-surface)' }}
                    />
                </Form.Item>
                <Form.Item>
                    <Space style={{ width: '100%', justifyContent: 'flex-end', gap: '12px' }}>
                        <Button
                            onClick={handleTest}
                            loading={testing}
                            style={{
                                background: 'var(--glass-soft)',
                                borderColor: 'var(--forest-600)',
                                color: 'var(--forest-700)',
                            }}
                        >
                            {t('config.testConnection')}
                        </Button>
                        <Button
                            type="primary"
                            htmlType="submit"
                            style={{
                                background: 'linear-gradient(135deg, var(--forest-700) 0%, var(--forest-600) 100%)',
                                border: 'none',
                            }}
                        >
                            {t('config.save')}
                        </Button>
                    </Space>
                </Form.Item>
            </Form>
        </div>
    );
}
