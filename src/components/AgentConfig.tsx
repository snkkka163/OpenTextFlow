import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, message, Popconfirm, Space } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { t } from '../i18n';

export interface AIAgent {
    id: string;
    name: string;
    description: string;
    systemPrompt: string;
}

const glassStyle = {
    background: 'var(--glass-solid)',
    backdropFilter: 'blur(12px)',
    border: 'var(--mist-border)',
    borderRadius: '8px',
};

const DEFAULT_AGENTS: AIAgent[] = [
    {
        id: 'default-editor',
        name: t('agent.generalEditor'),
        description: t('agent.generalEditorDesc'),
        systemPrompt: 'You are an expert AI text editor. Review and improve the following text based on the user instruction. Provide only the edited text, nothing else. Do not wrap the output in quotes or markdown blocks unless requested.'
    },
    {
        id: 'academic-polisher',
        name: t('agent.aigcReducer'),
        description: t('agent.aigcReducerDesc'),
        systemPrompt: 'You are an academic polishing assistant. Rewrite the provided text to make it clearer, more natural, and more human-like while preserving the original meaning. Keep a formal, objective, academic tone. Use varied sentence structures and precise wording. Provide ONLY the rewritten text.'
    }
];

export default function AgentConfig() {
    const [agents, setAgents] = useState<AIAgent[]>([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingAgent, setEditingAgent] = useState<AIAgent | null>(null);
    const [form] = Form.useForm();

    useEffect(() => {
        void loadAgents();
    }, []);

    const loadAgents = async () => {
        try {
            const electron = window.require ? window.require('electron') : null;
            if (!electron) {
                setAgents(DEFAULT_AGENTS);
                return;
            }

            const result = await electron.ipcRenderer.invoke('db:getAgents');
            if (result.success) {
                setAgents(result.data || []);
            } else {
                message.error(`${t('agent.loadError')}: ${result.error}`);
                setAgents(DEFAULT_AGENTS);
            }
        } catch (error: any) {
            message.error(`${t('agent.loadError')}: ${error.message}`);
            setAgents(DEFAULT_AGENTS);
        }
    };

    const handleAdd = () => {
        setEditingAgent(null);
        form.resetFields();
        setIsModalVisible(true);
    };

    const handleEdit = (record: AIAgent) => {
        setEditingAgent(record);
        form.setFieldsValue(record);
        setIsModalVisible(true);
    };

    const handleDelete = async (id: string) => {
        if (id === 'default-editor') {
            message.warning(t('agent.deleteError'));
            return;
        }
        try {
            const electron = window.require ? window.require('electron') : null;
            if (!electron) {
                message.error(t('agent.saveError'));
                return;
            }

            const result = await electron.ipcRenderer.invoke('db:deleteAgent', { id });
            if (!result.success) {
                message.error(`${t('agent.saveError')}: ${result.error}`);
                return;
            }

            setAgents((prev) => prev.filter((a) => a.id !== id));
            message.success(t('agent.deleteSuccess'));
        } catch (error: any) {
            message.error(`${t('agent.saveError')}: ${error.message}`);
        }
    };

    const handleSave = async () => {
        try {
            const values = await form.validateFields();
            let updatedAgents: AIAgent[];

            if (editingAgent) {
                updatedAgents = agents.map(a =>
                    a.id === editingAgent.id ? { ...a, ...values } : a
                );
            } else {
                const newAgent: AIAgent = {
                    ...values,
                    id: `agent-${Date.now()}`
                };
                updatedAgents = [...agents, newAgent];
            }

            const electron = window.require ? window.require('electron') : null;
            if (!electron) {
                message.error(t('agent.saveError'));
                return;
            }

            const payload = editingAgent
                ? { ...editingAgent, ...values }
                : {
                    ...values,
                    id: `agent-${Date.now()}`,
                    isDefault: 0,
                };

            const result = await electron.ipcRenderer.invoke('db:upsertAgent', payload);
            if (!result.success) {
                message.error(`${t('agent.saveError')}: ${result.error}`);
                return;
            }

            setAgents(updatedAgents);
            setIsModalVisible(false);
            message.success(t('agent.saveSuccess'));
        } catch (error) {
            // Validation failed or save error handled above
        }
    };

    const columns = [
        {
            title: t('agent.name'),
            dataIndex: 'name',
            key: 'name',
            width: 200,
        },
        {
            title: t('agent.description'),
            dataIndex: 'description',
            key: 'description',
        },
        {
            title: t('agent.actions'),
            key: 'actions',
            width: 150,
            render: (_: any, record: AIAgent) => (
                <Space>
                    <Button
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                    />
                    <Popconfirm
                        title={t('agent.deleteConfirm')}
                        onConfirm={() => handleDelete(record.id)}
                        disabled={record.id === 'default-editor'}
                    >
                        <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            disabled={record.id === 'default-editor'}
                        />
                    </Popconfirm>
                </Space>
            ),
        }
    ];

    return (
        <div style={{ ...glassStyle, padding: '20px' }}>
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>{t('agent.configureAgents')}</div>
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={handleAdd}
                    style={{
                        background: 'linear-gradient(135deg, var(--forest-700) 0%, var(--forest-600) 100%)',
                        border: 'none',
                    }}
                >
                    {t('agent.addAgent')}
                </Button>
            </div>

            <Table
                dataSource={agents}
                columns={columns}
                rowKey="id"
                pagination={false}
                size="small"
                style={{
                    background: 'rgba(255, 255, 255, 0.5)',
                    borderRadius: '8px',
                }}
            />

            <Modal
                title={editingAgent ? t('agent.editAgent') : t('agent.addAgent')}
                open={isModalVisible}
                onOk={handleSave}
                onCancel={() => setIsModalVisible(false)}
                width={600}
                destroyOnClose
            >
                <Form form={form} layout="vertical">
                    <Form.Item
                        name="name"
                        label={t('agent.name')}
                        rules={[{ required: true, message: t('agent.name') }]}
                    >
                        <Input placeholder="例如：学术润色助手" />
                    </Form.Item>
                    <Form.Item
                        name="description"
                        label={t('agent.description')}
                    >
                        <Input placeholder={t('agent.description')} />
                    </Form.Item>
                    <Form.Item
                        name="systemPrompt"
                        label={t('agent.systemPrompt')}
                        rules={[{ required: true, message: t('agent.systemPrompt') }]}
                        extra={t('agent.systemPrompt')}
                    >
                        <Input.TextArea rows={6} placeholder="e.g. You are an academic writing expert specialized in rewriting..." />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
