import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SystemVersion } from '@/types';
import VersionModal from './VersionModal';
import { buildVersionModalCopyText } from './versionModalContract';

const { getSystemVersion, messageSuccess, messageError } = vi.hoisted(() => ({
  getSystemVersion: vi.fn(),
  messageSuccess: vi.fn(),
  messageError: vi.fn(),
}));

const translations: Record<string, string> = {
  'versionModal.title': 'System Version Info',
  'versionModal.actions.copy': 'Copy Info',
  'versionModal.actions.copied': 'Copied',
  'versionModal.messages.loadFailed': 'Failed to load version info',
  'versionModal.messages.copySuccess': 'Version information copied',
  'versionModal.states.loading': 'Loading system version info...',
  'versionModal.states.loadError': 'Failed to load version information. Please check your network.',
  'versionModal.copy.product': 'Product',
  'versionModal.copy.version': 'Version',
  'versionModal.copy.gitSha': 'Git SHA',
  'versionModal.copy.gitRef': 'Git Ref',
  'versionModal.copy.buildTime': 'Build Time',
  'versionModal.copy.buildRef': 'Build Ref',
  'versionModal.copy.apiVersion': 'API Version',
  'versionModal.copy.schema': 'Schema',
  'versionModal.fields.buildFallback': 'Build {{value}}',
  'versionModal.fields.gitCommit': 'Git Commit',
  'versionModal.fields.dirty': 'DIRTY',
  'versionModal.fields.buildTime': 'Build Time',
  'versionModal.fields.apiVersion': 'API Version',
  'versionModal.fields.schema': 'Schema',
  'versionModal.footer.author': 'HouYuxi',
  'versionModal.footer.rights': 'All Rights Reserved.',
  'common.buttons.confirm': 'Confirm',
};

vi.mock('@/shared/services/api', () => ({
  default: {
    getSystemVersion,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      if (key === 'versionModal.fields.buildFallback') {
        return translations[key].replace('{{value}}', options?.value || '');
      }
      return translations[key] || key;
    },
    i18n: {
      resolvedLanguage: 'en-US',
    },
  }),
}));

vi.mock('antd', () => ({
  Modal: ({ open, title, children, footer, onCancel }: any) => (
    open ? (
      <div data-testid="modal-root">
        <div>{title}</div>
        <button type="button" onClick={onCancel}>close-modal</button>
        <div>{children}</div>
        <div>{footer}</div>
      </div>
    ) : null
  ),
  Tag: ({ children }: any) => <span>{children}</span>,
  Button: ({ children, onClick }: any) => <button type="button" onClick={onClick}>{children}</button>,
  message: {
    success: messageSuccess,
    error: messageError,
  },
}));

vi.mock('lucide-react', () => ({
  Copy: () => <span data-testid="icon-copy" />,
  Check: () => <span data-testid="icon-check" />,
  Server: () => <span data-testid="icon-server" />,
  GitBranch: () => <span data-testid="icon-git-branch" />,
  Clock: () => <span data-testid="icon-clock" />,
  Package: () => <span data-testid="icon-package" />,
}));

const versionInfo: SystemVersion = {
  product: 'Next-Gen Enterprise Portal',
  product_id: 'enterprise-portal',
  version: '1.1.0-beta.20260306114409',
  semver: '1.1.0',
  channel: 'beta',
  git_sha: 'a27b3a2-dirty',
  git_ref: 'main',
  dirty: true,
  build_time: '2026-03-06T11:44:09Z',
  build_number: '42',
  build_id: '20260306114409',
  release_id: 'R20260306-20260306114409',
  api_version: 'v1',
  db_schema_version: '20260306_0005',
};

describe('VersionModal contract', () => {
  beforeEach(() => {
    getSystemVersion.mockReset();
    getSystemVersion.mockResolvedValue(versionInfo);
    messageSuccess.mockReset();
    messageError.mockReset();
    vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('3/6/2026, 7:44:09 PM');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(),
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the version contract fields exposed by the backend', async () => {
    render(<VersionModal open onClose={vi.fn()} />);

    await waitFor(() => expect(getSystemVersion).toHaveBeenCalledTimes(1));

    expect(await screen.findByText('Next-Gen Enterprise Portal')).toBeInTheDocument();
    expect(screen.getByText('v1.1.0')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
    expect(screen.getByText('R20260306-20260306114409')).toBeInTheDocument();
    expect(screen.getByText('a27b3a2-dirty')).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('DIRTY')).toBeInTheDocument();
    expect(screen.getByText('3/6/2026, 7:44:09 PM')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText('20260306_0005')).toBeInTheDocument();
  });

  it('copies the full version contract text including git ref, build ref, api version, and schema', async () => {
    render(<VersionModal open onClose={vi.fn()} />);

    await screen.findByText('Next-Gen Enterprise Portal');

    fireEvent.click(screen.getByRole('button', { name: 'Copy Info' }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      buildVersionModalCopyText(versionInfo, {
        product: 'Product',
        version: 'Version',
        gitSha: 'Git SHA',
        gitRef: 'Git Ref',
        buildTime: 'Build Time',
        buildRef: 'Build Ref',
        apiVersion: 'API Version',
        schema: 'Schema',
      }),
    );
    expect(messageSuccess).toHaveBeenCalledWith('Version information copied');
  });

  it('falls back to build id when release id is absent', async () => {
    getSystemVersion.mockResolvedValueOnce({
      ...versionInfo,
      release_id: undefined,
      build_id: '20260306120000',
    });

    render(<VersionModal open onClose={vi.fn()} />);

    await screen.findByText('Next-Gen Enterprise Portal');

    expect(screen.getByText('Build 20260306120000')).toBeInTheDocument();
  });
});
