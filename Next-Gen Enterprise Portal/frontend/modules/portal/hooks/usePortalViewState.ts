import { useCallback, useState } from 'react';
import { AppView } from '@/modules/portal/types/views';

interface UsePortalViewStateResult {
  currentView: AppView;
  setCurrentView: (view: AppView) => void;
}

export const usePortalViewState = (): UsePortalViewStateResult => {
  const [mfaSetupRequired] = useState(() => localStorage.getItem('mfa_setup_required') === 'true');
  const [currentView, setCurrentViewInternal] = useState<AppView>(
    mfaSetupRequired ? AppView.SECURITY : AppView.DASHBOARD,
  );

  const setCurrentView = useCallback(
    (view: AppView) => {
      if (mfaSetupRequired && view !== AppView.SECURITY) return;
      setCurrentViewInternal(view);
    },
    [mfaSetupRequired],
  );

  return {
    currentView,
    setCurrentView,
  };
};
