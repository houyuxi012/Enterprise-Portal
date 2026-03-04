import { useMemo } from 'react';
import { Employee, NewsItem, QuickToolDTO } from '../types';
import { PortalRouterViewModel } from '../router/PortalRouterManager';
import {
  NEWS_CATEGORY_CODES,
  NEWS_CATEGORY_LABEL_KEYS,
  UsePortalViewModelResult,
} from './usePortalViewModel';

interface UsePortalRouterViewModelOptions extends UsePortalViewModelResult {
  globalSearch: string;
  activeAppCategory: string;
  setActiveAppCategory: (value: string) => void;
  activeNewsTab: string;
  setActiveNewsTab: (value: string) => void;
  tools: QuickToolDTO[];
  newsList: NewsItem[];
  employees: Employee[];
}

export const usePortalRouterViewModel = ({
  globalSearch,
  activeAppCategory,
  setActiveAppCategory,
  activeNewsTab,
  setActiveNewsTab,
  tools,
  newsList,
  employees,
  filteredTools,
  filteredNews,
  filteredTodos,
  filteredEmployees,
  searchAiInsight,
  isSearchAiLoading,
  licenseCustomerName,
  normalizeToolCategory,
  normalizeNewsCategory,
  renderToolCategoryLabel,
}: UsePortalRouterViewModelOptions): PortalRouterViewModel =>
  useMemo(
    () => ({
      globalSearch,
      activeAppCategory,
      setActiveAppCategory,
      activeNewsTab,
      setActiveNewsTab,
      tools,
      newsList,
      employees,
      filteredTools,
      filteredNews,
      filteredTodos,
      filteredEmployees,
      searchAiInsight,
      isSearchAiLoading,
      licenseCustomerName,
      normalizeToolCategory,
      normalizeNewsCategory,
      renderToolCategoryLabel,
      newsCategoryCodes: NEWS_CATEGORY_CODES,
      newsCategoryLabelKeys: NEWS_CATEGORY_LABEL_KEYS,
    }),
    [
      globalSearch,
      activeAppCategory,
      setActiveAppCategory,
      activeNewsTab,
      setActiveNewsTab,
      tools,
      newsList,
      employees,
      filteredTools,
      filteredNews,
      filteredTodos,
      filteredEmployees,
      searchAiInsight,
      isSearchAiLoading,
      licenseCustomerName,
      normalizeToolCategory,
      normalizeNewsCategory,
      renderToolCategoryLabel,
    ],
  );
