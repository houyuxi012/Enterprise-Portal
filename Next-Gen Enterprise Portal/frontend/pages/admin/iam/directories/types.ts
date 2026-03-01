export type DirectoryType = 'ldap' | 'ad';

export interface DirectoryConfig {
  id: number;
  name: string;
  type: DirectoryType;
  host: string;
  port: number;
  use_ssl: boolean;
  start_tls: boolean;
  bind_dn?: string | null;
  remark?: string | null;
  base_dn: string;
  user_filter: string;
  username_attr: string;
  email_attr: string;
  display_name_attr: string;
  mobile_attr: string;
  avatar_attr: string;
  sync_mode: 'manual' | 'auto';
  sync_interval_minutes?: number | null;
  enabled: boolean;
  has_bind_password: boolean;
  created_at: string;
  updated_at: string;
}

export interface DirectoryListResponse {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  items: DirectoryConfig[];
}

export interface DirectoryCreateStarterValues {
  type: DirectoryType;
  name: string;
  remark?: string;
}

export interface DirectoryCreatePayload {
  name: string;
  type: DirectoryType;
  host: string;
  port: number;
  use_ssl: boolean;
  start_tls: boolean;
  bind_dn?: string | null;
  remark?: string | null;
  bind_password?: string | null;
  base_dn: string;
  user_filter: string;
  username_attr?: string;
  email_attr?: string;
  display_name_attr?: string;
  mobile_attr?: string;
  avatar_attr?: string;
  sync_mode?: 'manual' | 'auto';
  sync_interval_minutes?: number | null;
  enabled: boolean;
}

export interface DirectoryUpdatePayload {
  name?: string;
  type?: DirectoryType;
  host?: string;
  port?: number;
  use_ssl?: boolean;
  start_tls?: boolean;
  bind_dn?: string | null;
  remark?: string | null;
  bind_password?: string | null;
  base_dn?: string;
  user_filter?: string;
  username_attr?: string;
  email_attr?: string;
  display_name_attr?: string;
  mobile_attr?: string;
  avatar_attr?: string;
  sync_mode?: 'manual' | 'auto';
  sync_interval_minutes?: number | null;
  enabled?: boolean;
}

export interface DirectoryTestPayload {
  username?: string;
  password?: string;
}

export interface DirectoryDraftTestPayload {
  type: DirectoryType;
  host: string;
  port: number;
  use_ssl: boolean;
  start_tls: boolean;
  bind_dn?: string | null;
  bind_password?: string | null;
  base_dn: string;
  user_filter: string;
  username_attr?: string;
  email_attr?: string;
  display_name_attr?: string;
  mobile_attr?: string;
  avatar_attr?: string;
  username?: string;
  password?: string;
}

export interface DirectoryTestResponse {
  success: boolean;
  message: string;
  matched_dn?: string | null;
  attributes?: Record<string, string | null>;
}

export interface ApiErrorDetail {
  code?: string;
  message?: string;
  reason?: string;
  [key: string]: unknown;
}
