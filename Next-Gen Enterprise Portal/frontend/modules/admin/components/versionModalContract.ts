import { SystemVersion } from '@/types';

type VersionModalFieldHandling = 'display' | 'copy' | 'internal';

export const VERSION_MODAL_FIELD_HANDLING = {
  product: 'display',
  product_id: 'internal',
  version: 'display',
  semver: 'display',
  channel: 'display',
  git_sha: 'display',
  git_ref: 'display',
  dirty: 'display',
  build_time: 'display',
  build_number: 'copy',
  build_id: 'display',
  release_id: 'display',
  api_version: 'display',
  db_schema_version: 'display',
} as const satisfies Record<keyof Required<SystemVersion>, VersionModalFieldHandling>;

export interface VersionModalCopyLabels {
  product: string;
  version: string;
  gitSha: string;
  gitRef: string;
  buildTime: string;
  buildRef: string;
  apiVersion: string;
  schema: string;
}

export const getVersionModalBuildReference = (versionInfo: SystemVersion): string => (
  versionInfo.release_id
  || versionInfo.build_id
  || versionInfo.build_number
  || 'N/A'
);

export const buildVersionModalCopyText = (
  versionInfo: SystemVersion,
  labels: VersionModalCopyLabels,
): string => {
  const gitRef = versionInfo.git_ref || 'unknown';
  const apiVersion = versionInfo.api_version || 'v1';
  const dbSchemaVersion = versionInfo.db_schema_version || '1.0.0';
  const buildReference = getVersionModalBuildReference(versionInfo);

  return [
    `${labels.product}: ${versionInfo.product}`,
    `${labels.version}: ${versionInfo.version}`,
    `${labels.gitSha}: ${versionInfo.git_sha}`,
    `${labels.gitRef}: ${gitRef}`,
    `${labels.buildTime}: ${versionInfo.build_time}`,
    `${labels.buildRef}: ${buildReference}`,
    `${labels.apiVersion}: ${apiVersion}`,
    `${labels.schema}: ${dbSchemaVersion}`,
  ].join('\n');
};
