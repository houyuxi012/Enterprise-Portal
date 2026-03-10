import React, { useEffect, useState } from 'react';
import { App, Avatar, Card, Col, Form, Input, List, Row, Select, Space, Switch, Typography, Upload } from 'antd';
import { SaveOutlined, UploadOutlined, RobotOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient from '@/services/api';
import { AppButton, AppPageHeader } from '@/modules/admin/components/ui';

const { Text, Title } = Typography;

const AISettings: React.FC = () => {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();
    const [imageUrl, setImageUrl] = useState<string>('');
    const [models, setModels] = useState<any[]>([]);

    const fetchConfig = async () => {
        setLoading(true);
        try {
            const [config, modelList] = await Promise.all([
                ApiClient.getSystemConfig(),
                ApiClient.getAIModels()
            ]);

            setModels(modelList);

            form.setFieldsValue({
                ai_name: config.ai_name || t('aiSettingsPage.preview.defaultName'),
                ai_icon: config.ai_icon || '',
                ai_enabled: config.ai_enabled !== 'false', // Default true implies enabled unless explicitly false
                search_ai_enabled: config.search_ai_enabled !== 'false',
                kb_enabled: config.kb_enabled !== 'false',
                default_ai_model: config.default_ai_model ? Number(config.default_ai_model) : (modelList.length > 0 ? modelList[0].id : undefined)
            });
            setImageUrl(config.ai_icon || '');
        } catch (error) {
            message.error(t('aiSettingsPage.messages.loadFailed'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConfig();
    }, []);

    const handleSave = async (values: any) => {
        setLoading(true);
        try {
            // Convert boolean to string for backend storage
            // Convert boolean to string for backend storage
            const configToSave = {
                ai_name: values.ai_name,
                ai_icon: values.ai_icon,
                ai_enabled: String(values.ai_enabled),
                search_ai_enabled: String(values.search_ai_enabled),
                kb_enabled: String(values.kb_enabled),
                default_ai_model: values.default_ai_model ? String(values.default_ai_model) : '',
            };
            await ApiClient.updateSystemConfig(configToSave);
            message.success(t('aiSettingsPage.messages.saveSuccess'));
            // Trigger a re-fetch or context update if needed
            window.location.reload(); // Simple reload to apply global changes for now
        } catch (error) {
            message.error(t('aiSettingsPage.messages.saveFailed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="admin-page admin-page-spaced">
            <AppPageHeader
                title={t('aiSettingsPage.page.title')}
                subtitle={t('aiSettingsPage.page.subtitle')}
                action={
                    <AppButton
                        intent="primary"
                        icon={<SaveOutlined />}
                        onClick={() => form.submit()}
                        loading={loading}
                    >
                        {t('aiSettingsPage.page.saveButton')}
                    </AppButton>
                }
            />

            <Row gutter={[24, 24]}>
                <Col xs={24} lg={16}>
                    <Card className="admin-card overflow-hidden">
                        <Form
                            form={form}
                            layout="vertical"
                            onFinish={handleSave}
                            className="p-4"
                        >
                            <Form.Item
                                name="ai_enabled"
                                label={t('aiSettingsPage.form.aiEnabled')}
                                valuePropName="checked"
                                help={t('aiSettingsPage.form.aiEnabledHelp')}
                            >
                                <Switch />
                            </Form.Item>

                            <Form.Item
                                name="search_ai_enabled"
                                label={t('aiSettingsPage.form.searchAiEnabled')}
                                valuePropName="checked"
                                help={t('aiSettingsPage.form.searchAiEnabledHelp')}
                            >
                                <Switch />
                            </Form.Item>

                            <Form.Item
                                name="kb_enabled"
                                label={t('aiSettingsPage.form.kbEnabled')}
                                valuePropName="checked"
                                help={t('aiSettingsPage.form.kbEnabledHelp')}
                            >
                                <Switch />
                            </Form.Item>

                            <Form.Item
                                name="default_ai_model"
                                label={t('aiSettingsPage.form.defaultModel')}
                                help={t('aiSettingsPage.form.defaultModelHelp')}
                            >
                                <Select placeholder={t('aiSettingsPage.form.placeholders.defaultModel')}>
                                    {models.map(m => (
                                        <Select.Option key={m.id} value={m.id}>{m.name} ({m.model})</Select.Option>
                                    ))}
                                </Select>
                            </Form.Item>

                            <Form.Item
                                name="ai_name"
                                label={t('aiSettingsPage.form.name')}
                                rules={[{ required: true, message: t('aiSettingsPage.form.validation.nameRequired') }]}
                            >
                                <Input prefix={<RobotOutlined />} placeholder={t('aiSettingsPage.form.placeholders.name')} />
                            </Form.Item>

                            <Form.Item
                                name="ai_icon"
                                label={t('aiSettingsPage.form.icon')}
                                help={t('aiSettingsPage.form.iconHelp')}
                            >
                                <Space.Compact style={{ width: '100%' }}>
                                    <Input
                                        value={imageUrl}
                                        onChange={(e) => {
                                            setImageUrl(e.target.value);
                                            form.setFieldValue('ai_icon', e.target.value);
                                        }}
                                        placeholder={t('aiSettingsPage.form.placeholders.iconUrl')}
                                        prefix={<UploadOutlined />}
                                    />
                                    <Upload
                                        accept="image/png"
                                        showUploadList={false}
                                        beforeUpload={(file) => {
                                            if (file.type !== 'image/png') {
                                                message.error(t('aiSettingsPage.messages.onlyPng'));
                                                return Upload.LIST_IGNORE;
                                            }
                                            return true;
                                        }}
                                        customRequest={async ({ file, onSuccess, onError }) => {
                                            try {
                                                const url = await ApiClient.uploadImage(file as File);
                                                setImageUrl(url);
                                                form.setFieldValue('ai_icon', url);
                                                message.success(t('aiSettingsPage.messages.uploadSuccess'));
                                                onSuccess?.(url);
                                            } catch (err) {
                                                message.error(t('aiSettingsPage.messages.uploadFailed'));
                                                onError?.(err as Error);
                                            }
                                        }}
                                    >
                                        <AppButton intent="secondary" icon={<UploadOutlined />}>{t('aiSettingsPage.form.uploadPng')}</AppButton>
                                    </Upload>
                                </Space.Compact>
                            </Form.Item>
                        </Form>
                    </Card>
                </Col>

                <Col xs={24} lg={8}>
                    <Card className="admin-card h-full">
                        <Space direction="vertical" size="large" style={{ width: '100%', alignItems: 'center' }}>
                            <Title level={5} style={{ margin: 0 }}>{t('aiSettingsPage.preview.title')}</Title>

                            <Avatar
                                size={64}
                                src={imageUrl || undefined}
                                icon={!imageUrl ? <SparklesIcon /> : undefined}
                                shape="circle"
                            />

                            <Space direction="vertical" size={4} style={{ width: '100%', textAlign: 'center' }}>
                                <Text strong>{form.getFieldValue('ai_name') || t('aiSettingsPage.preview.defaultName')}</Text>
                                <Text type="secondary">{t('aiSettingsPage.preview.tip')}</Text>
                            </Space>

                            <Card size="small" className="admin-card-subtle" style={{ width: '100%' }}>
                                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                                    <Text strong>{t('aiSettingsPage.preview.notesTitle')}</Text>
                                    <List
                                        size="small"
                                        dataSource={[
                                            t('aiSettingsPage.preview.notes.iconFormats'),
                                            t('aiSettingsPage.preview.notes.recommendedSize'),
                                            t('aiSettingsPage.preview.notes.toggleEffective'),
                                        ]}
                                        renderItem={(item) => <List.Item>{item}</List.Item>}
                                    />
                                </Space>
                            </Card>
                        </Space>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

// Simple icon component for preview
const SparklesIcon = () => (
    <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
);

export default AISettings;
