import React, { Suspense, lazy, useEffect, useState } from 'react';
import App from 'antd/es/app';
import Card from 'antd/es/card';
import Image from 'antd/es/image';
import Popconfirm from 'antd/es/popconfirm';
import Space from 'antd/es/space';
import Typography from 'antd/es/typography';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient from '@/services/api';
import type { CarouselItem } from '@/types';
import type { ColumnsType } from 'antd/es/table';
import { AppButton, AppPageHeader, AppTable, AppTag } from '@/modules/admin/components/ui';

const CarouselEditorModal = lazy(() => import('@/modules/admin/components/carousel/CarouselEditorModal'));

const { Link, Text } = Typography;

const CarouselList: React.FC = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [items, setItems] = useState<CarouselItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CarouselItem | null>(null);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const data = await ApiClient.getAdminCarouselItems();
      setItems(data);
    } catch {
      message.error(t('carouselList.messages.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchItems();
  }, []);

  const handleAdd = () => {
    setEditingItem(null);
    setIsModalOpen(true);
  };

  const handleEdit = (record: CarouselItem) => {
    setEditingItem(record);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await ApiClient.deleteCarouselItem(id);
      message.success(t('carouselList.messages.deleteSuccess'));
      await fetchItems();
    } catch {
      message.error(t('carouselList.messages.deleteFailed'));
    }
  };

  const columns: ColumnsType<CarouselItem> = [
    {
      title: t('carouselList.table.preview'),
      dataIndex: 'image',
      key: 'image',
      width: 150,
      render: (text: string) => (
        <Image
          src={text}
          alt={t('carouselList.table.previewAlt')}
          width={128}
          height={80}
          style={{ borderRadius: 12, objectFit: 'cover' }}
          preview
        />
      ),
    },
    {
      title: t('carouselList.table.title'),
      dataIndex: 'title',
      key: 'title',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: t('carouselList.table.badge'),
      dataIndex: 'badge',
      key: 'badge',
      width: 100,
      render: (text: string) => <AppTag status="info">{text}</AppTag>,
    },
    {
      title: t('carouselList.table.url'),
      dataIndex: 'url',
      key: 'url',
      render: (text: string) => (
        <Link href={text} target="_blank" rel="noreferrer" ellipsis>
          {text}
        </Link>
      ),
    },
    {
      title: t('carouselList.table.sortOrder'),
      dataIndex: 'sort_order',
      key: 'sort_order',
      width: 80,
      render: (text: number) => <Text code>{text}</Text>,
    },
    {
      title: t('carouselList.table.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (active: boolean) => (
        <AppTag status={active ? 'success' : 'default'}>
          {active ? t('carouselList.status.visible') : t('carouselList.status.hidden')}
        </AppTag>
      ),
    },
    {
      title: t('carouselList.table.actions'),
      key: 'action',
      width: 120,
      render: (_: unknown, record: CarouselItem) => (
        <Space size="small">
          <AppButton intent="tertiary" iconOnly size="sm" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
              <Popconfirm title={t('carouselList.confirm.deleteTitle')} onConfirm={() => handleDelete(record.id)}>
                <AppButton intent="danger" size="sm">
                  {t('common.buttons.delete')}
                </AppButton>
              </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="admin-page admin-page-spaced">
      <AppPageHeader
        title={t('carouselList.page.title')}
        subtitle={t('carouselList.page.subtitle')}
        action={
          <AppButton intent="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            {t('carouselList.page.createButton')}
          </AppButton>
        }
      />

      <Card className="admin-card overflow-hidden">
        <AppTable columns={columns} dataSource={items} rowKey="id" loading={loading} emptyText={t('carouselList.table.empty')} />
      </Card>

      {isModalOpen ? (
        <Suspense fallback={null}>
          <CarouselEditorModal
            open={isModalOpen}
            initialItem={editingItem}
            onCancel={() => setIsModalOpen(false)}
            onSaved={async () => {
              setIsModalOpen(false);
              await fetchItems();
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
};

export default CarouselList;
