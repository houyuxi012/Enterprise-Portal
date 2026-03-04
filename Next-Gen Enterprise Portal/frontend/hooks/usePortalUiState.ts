import { useState } from 'react';

interface UsePortalUiStateResult {
  activeNewsTab: string;
  setActiveNewsTab: (value: string) => void;
  activeAppCategory: string;
  setActiveAppCategory: (value: string) => void;
  globalSearch: string;
  setGlobalSearch: (value: string) => void;
}

export const usePortalUiState = (): UsePortalUiStateResult => {
  const [activeNewsTab, setActiveNewsTab] = useState('all');
  const [activeAppCategory, setActiveAppCategory] = useState('all');
  const [globalSearch, setGlobalSearch] = useState('');

  return {
    activeNewsTab,
    setActiveNewsTab,
    activeAppCategory,
    setActiveAppCategory,
    globalSearch,
    setGlobalSearch,
  };
};
