import React, { lazy, Suspense, useState } from 'react';
import { Spin } from 'antd';
import { AppView, Employee, NewsItem, QuickToolDTO } from '../types';

const Navbar = lazy(() => import('./Navbar'));
const AIAssistant = lazy(() => import('./AIAssistant'));

const SuspenseFallback: React.FC = () => (
  <div className="flex items-center justify-center py-16">
    <Spin size="large" />
  </div>
);

interface PortalShellProps {
  currentView: AppView;
  setCurrentView: (view: AppView) => void;
  globalSearch: string;
  setGlobalSearch: (value: string) => void;
  onLogout: () => void;
  tools: QuickToolDTO[];
  newsList: NewsItem[];
  employees: Employee[];
  currentUser: any;
  systemConfig: Record<string, string>;
  footerDefaultText: string;
  renderView: () => React.ReactNode;
}

const PortalShell: React.FC<PortalShellProps> = ({
  currentView,
  setCurrentView,
  globalSearch,
  setGlobalSearch,
  onLogout,
  tools,
  newsList,
  employees,
  currentUser,
  systemConfig,
  footerDefaultText,
  renderView,
}) => {
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [assistantInitialPrompt, setAssistantInitialPrompt] = useState('');

  return (
    <div className="min-h-screen flex flex-col selection:bg-blue-600 selection:text-white transition-colors">
      <Suspense fallback={<SuspenseFallback />}>
        <Navbar
          currentView={currentView}
          setView={setCurrentView}
          globalSearch={globalSearch}
          setGlobalSearch={setGlobalSearch}
          onAskAI={(prompt) => {
            setIsAssistantOpen(true);
            setAssistantInitialPrompt(prompt);
          }}
          onLogout={onLogout}
          tools={tools}
          news={newsList}
          employees={employees}
          currentUser={currentUser}
          systemConfig={systemConfig}
        />
      </Suspense>

      <main className="flex-1 mt-24 px-6 sm:px-8 pb-16">
        <div className="max-w-7xl mx-auto">
          <Suspense fallback={<SuspenseFallback />}>
            {renderView()}
          </Suspense>
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-slate-400 dark:text-slate-600 font-medium tracking-wide">
        {systemConfig.footer_text || footerDefaultText}
      </footer>

      <Suspense fallback={null}>
        <AIAssistant
          isOpen={isAssistantOpen}
          setIsOpen={setIsAssistantOpen}
          initialPrompt={assistantInitialPrompt}
        />
      </Suspense>
    </div>
  );
};

export default PortalShell;
