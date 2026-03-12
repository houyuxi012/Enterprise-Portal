import React, { Suspense, lazy, useEffect, useState } from 'react';
import App from 'antd/es/app';
import Card from 'antd/es/card';
import List from 'antd/es/list';
import Popconfirm from 'antd/es/popconfirm';
import Space from 'antd/es/space';
import Tag from 'antd/es/tag';
import Typography from 'antd/es/typography';
import { AppstoreOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { QuickToolDTO } from '@/services/api';
import ApiClient from '@/services/api';
import { AppButton, AppPageHeader } from '@/modules/admin/components/ui';

const ToolEditorModal = lazy(() => import('@/modules/admin/components/tools/ToolEditorModal'));

const CATEGORY_CODES = [
  'administration',
  'it',
  'finance',
  'hr',
  'engineering',
  'design',
  'marketing',
  'legal',
  'general',
  'other',
] as const;

const { Text, Title } = Typography;

const IconPreview = ({ image }: { image?: string }) => (
  <Card size="small" className="admin-card-subtle" styles={{ body: { width: 48, height: 48, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' } }}>
    {image ? <img src={image} alt="icon" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <AppstoreOutlined />}
  </Card>
);

const ToolList: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { message } = App.useApp();
  const [tools, setTools] = useState<QuickToolDTO[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<QuickToolDTO | null>(null);
  const [loading, setLoading] = useState(false);

  const categoryAliases = React.useMemo(() => {
    const aliases: Record<string, string> = {};
    CATEGORY_CODES.forEach((code) => {
      aliases[code] = code;
      aliases[code.toUpperCase()] = code;
      const zhLabel = String(i18n.t(`toolList.categories.${code}`, { lng: 'zh-CN' })).trim();
      const enLabel = String(i18n.t(`toolList.categories.${code}`, { lng: 'en-US' })).trim();
      if (zhLabel) aliases[zhLabel] = code;
      if (enLabel) aliases[enLabel] = code;
    });
    return aliases;
  }, [i18n.resolvedLanguage]);

  const normalizeCategory = (value?: string): string => {
    const raw = String(value || '').trim();
    return categoryAliases[raw] || raw || 'general';
  };

  const fetchTools = async () => {
    setLoading(true);
    try {
      const data = await ApiClient.getTools();
      setTools(data);
    } catch {
      message.error(t('toolList.messages.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchTools();
  }, []);

  const handleDelete = async (id: number) => {
    try {
      await ApiClient.deleteTool(id);
      message.success(t('toolList.messages.deleteSuccess'));
      await fetchTools();
    } catch {
      message.error(t('toolList.messages.deleteFailed'));
    }
  };

  const handleEdit = (tool: QuickToolDTO) => {
    setEditingTool(tool);
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setEditingTool(null);
    setIsModalOpen(true);
  };

  return (
    <div className="admin-page admin-page-spaced">
      <AppPageHeader
        title={t('toolList.page.title')}
        subtitle={t('toolList.page.subtitle')}
        action={
          <AppButton intent="primary" icon={<PlusOutlined />} onClick={handleAddNew}>
            {t('toolList.page.createButton')}
          </AppButton>
        }
      />

      <List
        grid={{ gutter: 28, xs: 1, sm: 2, md: 2, lg: 3, xl: 4, xxl: 4 }}
        dataSource={tools}
        loading={loading}
        className="pb-10"
        renderItem={(item) => (
          <List.Item>
            <Card
              hoverable
              className="admin-card admin-card-subtle h-full"
              styles={{ body: { padding: 24 } }}
              actions={[
                <AppButton key="edit" intent="tertiary" iconOnly size="sm" icon={<EditOutlined />} onClick={() => handleEdit(item)} />,
                <Popconfirm key="delete" title={t('toolList.popconfirm.deleteTitle')} onConfirm={() => handleDelete(item.id)}>
                  <AppButton intent="danger" size="sm">
                    {t('common.buttons.delete')}
                  </AppButton>
                </Popconfirm>,
              ]}
            >
              <Space direction="vertical" align="center" size={12} style={{ width: '100%' }}>
                <div>
                  <IconPreview image={item.image} />
                </div>
                <Title level={5} style={{ margin: 0, textAlign: 'center' }}>{item.name}</Title>
                <Tag color="blue">{t(`toolList.categories.${normalizeCategory(item.category)}`, { defaultValue: item.category })}</Tag>
                <Text type="secondary" ellipsis={{ tooltip: item.url }} style={{ maxWidth: '100%', textAlign: 'center' }}>
                  {item.url}
                </Text>
              </Space>
            </Card>
          </List.Item>
        )}
      />

      {isModalOpen ? (
        <Suspense fallback={null}>
          <ToolEditorModal
            open={isModalOpen}
            initialTool={editingTool}
            onCancel={() => setIsModalOpen(false)}
            onSaved={async () => {
              setIsModalOpen(false);
              await fetchTools();
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
};

export default ToolList;
