import React, { Suspense, lazy, useEffect, useState } from 'react';
import App from 'antd/es/app';
import Card from 'antd/es/card';
import Image from 'antd/es/image';
import Popconfirm from 'antd/es/popconfirm';
import Space from 'antd/es/space';
import Tag from 'antd/es/tag';
import Typography from 'antd/es/typography';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { NewsItem } from '@/types';
import ApiClient from '@/services/api';
import type { ColumnsType } from 'antd/es/table';
import {
  AppButton,
  AppFilterBar,
  AppPageHeader,
  AppTable,
} from '@/modules/admin/components/ui';

const NewsEditorModal = lazy(() => import('@/modules/admin/components/news/NewsEditorModal'));

const { Text } = Typography;
const CATEGORY_CODES = ['announcement', 'activity', 'policy', 'culture'] as const;
const NEWS_PROMOTION_KEYS = [
  'show_in_news_feed',
  'show_in_news_center_carousel',
  'show_in_news_center_latest',
] as const;
const NEWS_CENTER_CAROUSEL_LIMIT = 4;

const NewsList: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { message } = App.useApp();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNews, setEditingNews] = useState<NewsItem | null>(null);
  const [textSearch, setTextSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const categoryAliases = React.useMemo(() => {
    const aliases: Record<string, string> = {};
    CATEGORY_CODES.forEach((code) => {
      aliases[code] = code;
      const zhLabel = String(i18n.t(`newsList.categories.${code}`, { lng: 'zh-CN' })).trim();
      const enLabel = String(i18n.t(`newsList.categories.${code}`, { lng: 'en-US' })).trim();
      if (zhLabel) aliases[zhLabel] = code;
      if (enLabel) aliases[enLabel] = code;
    });
    return aliases;
  }, [i18n.resolvedLanguage]);

  const normalizeCategory = (value?: string): string => {
    const raw = String(value || '').trim();
    return categoryAliases[raw] || raw || 'announcement';
  };

  const fetchNews = async () => {
    setLoading(true);
    try {
      const data = await ApiClient.getNews();
      setNews(data);
    } catch (error) {
      console.error(error);
      message.error(t('newsList.messages.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchNews();
  }, []);

  const handleDelete = async (id: number | string) => {
    try {
      await ApiClient.deleteNews(Number(id));
      message.success(t('newsList.messages.deleteSuccess'));
      await fetchNews();
    } catch {
      message.error(t('newsList.messages.deleteFailed'));
    }
  };

  const handleEdit = (item: NewsItem) => {
    setEditingNews(item);
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setEditingNews(null);
    setIsModalOpen(true);
  };

  const filteredNews = news.filter((item) => item.title.toLowerCase().includes(textSearch.toLowerCase()));
  const carouselPromotionCount = news.filter((item) => item.show_in_news_center_carousel).length;
  const carouselPromotionFull = carouselPromotionCount >= NEWS_CENTER_CAROUSEL_LIMIT;

  const columns: ColumnsType<NewsItem> = [
    {
      title: t('newsList.table.cover'),
      dataIndex: 'image',
      key: 'image',
      width: 80,
      render: (image: string) => (
        <Image
          src={image}
          alt={t('newsList.table.coverAlt')}
          width={48}
          height={32}
          preview={false}
          style={{ borderRadius: 8, objectFit: 'cover' }}
        />
      ),
    },
    {
      title: t('newsList.table.title'),
      dataIndex: 'title',
      key: 'title',
      render: (text: string, record: NewsItem) => (
        <div className="flex flex-col gap-2">
          <Text strong>{text}</Text>
          <Space size={[6, 6]} wrap>
            {NEWS_PROMOTION_KEYS.map((key) =>
              record[key] ? (
                <Tag key={key} color={key === 'show_in_news_center_carousel' ? 'purple' : 'blue'}>
                  {t(`newsList.table.promotionBadges.${key}`)}
                </Tag>
              ) : null,
            )}
          </Space>
        </div>
      ),
    },
    {
      title: t('newsList.table.category'),
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (category: string) => (
        <Tag color="blue">{t(`newsList.categories.${normalizeCategory(category)}`, { defaultValue: category })}</Tag>
      ),
    },
    {
      title: t('newsList.table.publishDate'),
      dataIndex: 'date',
      key: 'date',
      width: 120,
      render: (date: string) => <Text type="secondary">{date}</Text>,
    },
    {
      title: t('newsList.table.actions'),
      key: 'action',
      width: 160,
      render: (_: unknown, record: NewsItem) => (
        <Space size={8}>
          <AppButton intent="tertiary" size="sm" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            {t('common.buttons.edit')}
          </AppButton>
              <Popconfirm title={t('newsList.confirm.deleteTitle')} onConfirm={() => handleDelete(record.id)}>
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
        title={t('newsList.page.title')}
        subtitle={t('newsList.page.subtitle')}
        action={
          <AppButton intent="primary" icon={<PlusOutlined />} onClick={handleAddNew}>
            {t('newsList.page.publishButton')}
          </AppButton>
        }
      />

      <AppFilterBar>
        <AppFilterBar.Search
          placeholder={t('newsList.filters.searchPlaceholder')}
          value={textSearch}
          onChange={(event) => setTextSearch(event.target.value)}
          onSearch={setTextSearch}
        />
        <div className="ml-auto flex items-center gap-3">
          <Text type="secondary">
            {t('newsList.page.carouselQuota', {
              count: carouselPromotionCount,
              limit: NEWS_CENTER_CAROUSEL_LIMIT,
            })}
          </Text>
          <Tag color={carouselPromotionFull ? 'red' : 'purple'}>
            {carouselPromotionFull ? t('newsList.page.carouselFull') : t('newsList.page.carouselAvailable')}
          </Tag>
        </div>
      </AppFilterBar>

      <Card className="admin-card overflow-hidden">
        <AppTable
          columns={columns}
          dataSource={filteredNews}
          rowKey="id"
          loading={loading}
          emptyText={t('newsList.table.empty')}
        />
      </Card>

      {isModalOpen ? (
        <Suspense fallback={null}>
          <NewsEditorModal
            open={isModalOpen}
            initialNews={editingNews}
            newsItems={news}
            onCancel={() => setIsModalOpen(false)}
            onSaved={async () => {
              setIsModalOpen(false);
              await fetchNews();
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
};

export default NewsList;
