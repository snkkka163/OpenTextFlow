import { useState, useEffect } from 'react';
import { Table, Modal, Button, Empty, Spin, Space, Tag, message } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { t } from '../i18n';
import ReactDiffViewer from 'react-diff-viewer-continued';

export interface EditHistory {
    id: number;
    docPath: string;
    originalText: string;
    modifiedText: string;
    agentName: string;
    timestamp: string;
    prompt?: string;
}

interface EditHistoryViewerProps {
    docPath: string;
    open: boolean;
    onClose: () => void;
}

export default function EditHistoryViewer({ docPath, open, onClose }: EditHistoryViewerProps) {
    const [histories, setHistories] = useState<EditHistory[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedRecord, setSelectedRecord] = useState<EditHistory | null>(null);
    const [diffViewVisible, setDiffViewVisible] = useState(false);

    useEffect(() => {
        if (open) {
            void loadHistories();
        }
    }, [open, docPath]);

    const loadHistories = async () => {
        setLoading(true);
        try {
            const electron = window.require ? window.require('electron') : null;
            if (electron) {
                const result = await electron.ipcRenderer.invoke('db:getEditHistory', { docPath });
                if (result.success) {
                    setHistories(result.data);
                } else {
                    console.error('Failed to load histories:', result.error);
                    message.error(`${t('history.loadError')}: ${result.error}`);
                }
            }
        } catch (err) {
            console.error('Error loading edit histories:', err);
            message.error(t('history.loadError'));
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            const electron = window.require ? window.require('electron') : null;
            if (electron) {
                const result = await electron.ipcRenderer.invoke('db:deleteEditHistory', { id });
                if (result.success) {
                    setHistories(histories.filter(h => h.id !== id));
                    message.success(t('history.deleteSuccess'));
                } else {
                    message.error(`${t('history.deleteError')}: ${result.error}`);
                }
            }
        } catch (err) {
            console.error('Error deleting history:', err);
            message.error(t('history.deleteError'));
        }
    };

    const handleViewDiff = (record: EditHistory) => {
        setSelectedRecord(record);
        setDiffViewVisible(true);
    };

    const columns = [
        {
            title: t('history.timestamp') || 'Timestamp',
            dataIndex: 'timestamp',
            key: 'timestamp',
            width: 180,
            render: (text: string) => new Date(text).toLocaleString(),
        },
        {
            title: t('history.agent') || 'Agent',
            dataIndex: 'agentName',
            key: 'agentName',
            width: 150,
            render: (text: string) => <Tag color="green">{text}</Tag>,
        },
        {
            title: t('history.prompt') || 'Instruction',
            dataIndex: 'prompt',
            key: 'prompt',
            width: 200,
            render: (text: string) => <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{text || '-'}</span>,
        },
        {
            title: t('history.originalLength') || 'Original Length',
            dataIndex: 'originalText',
            key: 'originalLength',
            width: 120,
            render: (text: string) => text.length + ' chars',
        },
        {
            title: t('history.modifiedLength') || 'Modified Length',
            dataIndex: 'modifiedText',
            key: 'modifiedLength',
            width: 120,
            render: (text: string) => text.length + ' chars',
        },
        {
            title: t('history.actions') || 'Actions',
            key: 'actions',
            width: 150,
            render: (_: any, record: EditHistory) => (
                <Space>
                    <Button
                        type="primary"
                        size="small"
                        onClick={() => handleViewDiff(record)}
                    >
                        Diff
                    </Button>
                    <Button
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(record.id)}
                    />
                </Space>
            ),
        }
    ];

    return (
        <>
            <Modal
                title={t('history.editHistory') || 'Edit History'}
                open={open}
                onCancel={onClose}
                width={1200}
                footer={null}
                destroyOnClose
            >
                <Spin spinning={loading}>
                    {histories.length === 0 ? (
                        <Empty description={t('history.noData') || 'No edit history'} />
                    ) : (
                        <Table
                            dataSource={histories}
                            columns={columns}
                            rowKey="id"
                            pagination={{ pageSize: 10 }}
                            size="small"
                            style={{
                                background: 'rgba(255, 255, 255, 0.5)',
                                borderRadius: '8px',
                            }}
                        />
                    )}
                </Spin>
            </Modal>

            <Modal
                title={t('history.diffView') || 'Diff View'}
                open={diffViewVisible}
                onCancel={() => setDiffViewVisible(false)}
                width={1000}
                footer={null}
                destroyOnClose
            >
                {selectedRecord && (
                    <div>
                        <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--glass-soft)', borderRadius: '6px', border: '1px solid rgba(63, 138, 95, 0.2)', color: 'var(--text-primary)' }}>
                            <div><strong>Agent:</strong> {selectedRecord.agentName}</div>
                            <div><strong>Time:</strong> {new Date(selectedRecord.timestamp).toLocaleString()}</div>
                            {selectedRecord.prompt && <div><strong>Instruction:</strong> {selectedRecord.prompt}</div>}
                        </div>
                        <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                            <ReactDiffViewer
                                oldValue={selectedRecord.originalText}
                                newValue={selectedRecord.modifiedText}
                                splitView={true}
                                hideLineNumbers={false}
                            />
                        </div>
                    </div>
                )}
            </Modal>
        </>
    );
}
