import { useCallback, useEffect, useMemo, useState } from 'react';
import ApiClient from '@/services/api';
import { AppView, Employee, NewsItem, QuickToolDTO, Todo } from '@/types';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export const NEWS_CATEGORY_CODES = ['announcement', 'activity', 'policy', 'culture'] as const;
export type NewsCategoryCode = (typeof NEWS_CATEGORY_CODES)[number];

export const NEWS_CATEGORY_LABEL_KEYS: Record<NewsCategoryCode, string> = {
  announcement: 'appRoot.news.tabAnnouncement',
  activity: 'appRoot.news.tabActivity',
  policy: 'appRoot.news.tabPolicy',
  culture: 'appRoot.news.tabCulture',
};

const TOOL_CATEGORY_CODES = [
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

type ToolCategoryCode = (typeof TOOL_CATEGORY_CODES)[number];

const TOOL_CATEGORY_BASE_ALIASES: Record<string, ToolCategoryCode> = {
  administration: 'administration',
  行政: 'administration',
  办公: 'administration',
  office: 'administration',
  it: 'it',
  信息技术: 'it',
  finance: 'finance',
  财务: 'finance',
  hr: 'hr',
  'human resources': 'hr',
  人力资源: 'hr',
  engineering: 'engineering',
  研发: 'engineering',
  开发: 'engineering',
  design: 'design',
  设计: 'design',
  marketing: 'marketing',
  营销: 'marketing',
  legal: 'legal',
  法律: 'legal',
  general: 'general',
  通用: 'general',
  other: 'other',
  其他: 'other',
};

const normalizeAliasKey = (value: string): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[-_]/g, '');

interface UsePortalViewModelOptions {
  currentView: AppView;
  globalSearch: string;
  systemConfig: Record<string, string>;
  tools: QuickToolDTO[];
  newsList: NewsItem[];
  todos: Todo[];
  employees: Employee[];
  departments: string[];
  t: TranslateFn;
  i18n: any;
}

export interface UsePortalViewModelResult {
  licenseCustomerName: string;
  searchAiInsight: string | null;
  isSearchAiLoading: boolean;
  filteredTools: QuickToolDTO[];
  filteredNews: NewsItem[];
  filteredTodos: Todo[];
  filteredEmployees: Employee[];
  normalizeToolCategory: (value?: string) => string;
  normalizeNewsCategory: (value?: string) => NewsCategoryCode;
  renderToolCategoryLabel: (value: string) => string;
}

export const usePortalViewModel = ({
  currentView,
  globalSearch,
  systemConfig,
  tools,
  newsList,
  todos,
  employees,
  departments,
  t,
  i18n,
}: UsePortalViewModelOptions): UsePortalViewModelResult => {
  const [searchAiInsight, setSearchAiInsight] = useState<string | null>(null);
  const [isSearchAiLoading, setIsSearchAiLoading] = useState(false);

  const normalizeSearchText = useCallback((value: unknown) => String(value ?? '').toLowerCase(), []);

  const licenseCustomerName = useMemo(() => {
    const value = String(systemConfig?.customer_name || '').trim();
    if (!value || value === '-') return t('appRoot.news.customerFallback');
    return value;
  }, [systemConfig, t]);

  const toolCategoryAliases = useMemo(() => {
    const aliases: Record<string, ToolCategoryCode> = { ...TOOL_CATEGORY_BASE_ALIASES };
    const normalizedAliases: Record<string, ToolCategoryCode> = {};

    Object.entries(aliases).forEach(([key, code]) => {
      normalizedAliases[normalizeAliasKey(key)] = code;
      normalizedAliases[normalizeAliasKey(key.toUpperCase())] = code;
    });

    TOOL_CATEGORY_CODES.forEach((code) => {
      aliases[code] = code;
      aliases[code.toUpperCase()] = code;
      const zhLabel = String(i18n.t(`toolList.categories.${code}`, { lng: 'zh-CN' })).trim();
      const enLabel = String(i18n.t(`toolList.categories.${code}`, { lng: 'en-US' })).trim();
      if (zhLabel) {
        aliases[zhLabel] = code;
        normalizedAliases[normalizeAliasKey(zhLabel)] = code;
      }
      if (enLabel) {
        aliases[enLabel] = code;
        aliases[enLabel.toLowerCase()] = code;
        normalizedAliases[normalizeAliasKey(enLabel)] = code;
      }
    });

    return { aliases, normalizedAliases };
  }, [i18n.resolvedLanguage, i18n]);

  const toolCategoryKeywords = useMemo<Record<ToolCategoryCode, string[]>>(() => {
    const keywordConfig = i18n.t('appRoot.toolCategoryKeywords', {
      lng: 'zh-CN',
      returnObjects: true,
      defaultValue: {},
    }) as Record<string, unknown>;
    const toStringArray = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
    return {
      engineering: toStringArray(keywordConfig.engineering),
      administration: toStringArray(keywordConfig.administration),
      marketing: toStringArray(keywordConfig.marketing),
      legal: toStringArray(keywordConfig.legal),
      finance: toStringArray(keywordConfig.finance),
      hr: toStringArray(keywordConfig.hr),
      design: toStringArray(keywordConfig.design),
      general: toStringArray(keywordConfig.general),
      other: toStringArray(keywordConfig.other),
      it: toStringArray(keywordConfig.it),
    };
  }, [i18n, i18n.resolvedLanguage]);

  const normalizeToolCategory = useCallback((value?: string): string => {
    const raw = String(value || '').trim();
    if (!raw) return 'general';

    const direct =
      toolCategoryAliases.aliases[raw] || toolCategoryAliases.aliases[raw.toLowerCase()];
    if (direct) return direct;

    const normalized = normalizeAliasKey(raw);
    const normalizedMatch = toolCategoryAliases.normalizedAliases[normalized];
    if (normalizedMatch) return normalizedMatch;

    for (const [category, keywords] of Object.entries(toolCategoryKeywords)) {
      if (keywords.some((keyword) => raw.includes(keyword))) {
        return category;
      }
    }

    return raw;
  }, [toolCategoryAliases, toolCategoryKeywords]);

  const renderToolCategoryLabel = useCallback((value: string): string => {
    if (value === 'all') return t('common.status.all');
    if (TOOL_CATEGORY_CODES.includes(value as ToolCategoryCode)) {
      return t(`toolList.categories.${value}`);
    }
    return value;
  }, [t]);

  useEffect(() => {
    let canceled = false;
    if (currentView === AppView.SEARCH_RESULTS && globalSearch.trim()) {
      if (systemConfig && systemConfig.search_ai_enabled === 'false') {
        setSearchAiInsight(null);
        setIsSearchAiLoading(false);
        return () => {
          canceled = true;
        };
      }

      const fetchInsight = async () => {
        setIsSearchAiLoading(true);
        void ApiClient.logBusinessAction({
          action: 'SEARCH_QUERY',
          target: 'AI_INSIGHT',
          detail: `User searched for: ${globalSearch}`,
        });

        const prompt = t('appRoot.search.aiPrompt', { query: globalSearch });
        try {
          const response = await ApiClient.chatAI(prompt);
          if (!canceled) setSearchAiInsight(response);
        } catch (error) {
          if (!canceled) setSearchAiInsight(t('appRoot.search.aiFailed'));
        } finally {
          if (!canceled) setIsSearchAiLoading(false);
        }
      };
      void fetchInsight();
    } else if (currentView !== AppView.SEARCH_RESULTS) {
      setSearchAiInsight(null);
      setIsSearchAiLoading(false);
    }

    return () => {
      canceled = true;
    };
  }, [currentView, globalSearch, systemConfig, t]);

  const filteredTools = useMemo(() => {
    const keyword = normalizeSearchText(globalSearch);
    return tools.filter((tool) =>
      normalizeSearchText(tool?.name).includes(keyword) ||
      normalizeSearchText(tool?.category).includes(keyword)
    );
  }, [globalSearch, tools, normalizeSearchText]);

  const filteredNews = useMemo(() => {
    const keyword = normalizeSearchText(globalSearch);
    return newsList.filter((news) =>
      normalizeSearchText(news?.title).includes(keyword) ||
      normalizeSearchText(news?.summary).includes(keyword)
    );
  }, [globalSearch, newsList, normalizeSearchText]);

  const filteredTodos = useMemo(() => {
    const keyword = normalizeSearchText(globalSearch);
    return todos.filter((todo) =>
      normalizeSearchText(todo?.title).includes(keyword) ||
      normalizeSearchText(todo?.description).includes(keyword)
    );
  }, [globalSearch, todos, normalizeSearchText]);

  const filteredEmployees = useMemo(() => {
    const keyword = normalizeSearchText(globalSearch);
    return employees.filter((emp) => {
      const matchesSearch =
        normalizeSearchText(emp?.name).includes(keyword) ||
        normalizeSearchText(emp?.role).includes(keyword) ||
        normalizeSearchText(emp?.department).includes(keyword);

      const matchesDept =
        departments.length === 0 ||
        departments.includes(String(emp?.department ?? ''));

      return matchesSearch && matchesDept;
    });
  }, [globalSearch, departments, employees, normalizeSearchText]);

  const newsCategoryAliases = useMemo(() => {
    const aliases: Record<string, NewsCategoryCode> = {} as Record<string, NewsCategoryCode>;
    NEWS_CATEGORY_CODES.forEach((code) => {
      aliases[code] = code;
      const key = NEWS_CATEGORY_LABEL_KEYS[code];
      const zhLabel = String(i18n.t(key, { lng: 'zh-CN' })).trim();
      const enLabel = String(i18n.t(key, { lng: 'en-US' })).trim();
      if (zhLabel) aliases[zhLabel] = code;
      if (enLabel) aliases[enLabel] = code;
    });
    return aliases;
  }, [i18n.resolvedLanguage, i18n]);

  const normalizeNewsCategory = useCallback((value?: string): NewsCategoryCode => {
    const raw = String(value || '').trim();
    if (raw in newsCategoryAliases) {
      return newsCategoryAliases[raw];
    }
    const lowerRaw = raw.toLowerCase();
    if (lowerRaw in newsCategoryAliases) {
      return newsCategoryAliases[lowerRaw];
    }
    return 'announcement';
  }, [newsCategoryAliases]);

  return {
    licenseCustomerName,
    searchAiInsight,
    isSearchAiLoading,
    filteredTools,
    filteredNews,
    filteredTodos,
    filteredEmployees,
    normalizeToolCategory,
    normalizeNewsCategory,
    renderToolCategoryLabel,
  };
};
