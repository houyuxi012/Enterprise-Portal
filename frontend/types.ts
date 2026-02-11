
import React from 'react';

export enum AppView {
  DASHBOARD = 'dashboard',
  NEWS = 'news',
  DIRECTORY = 'directory',
  RESOURCES = 'resources',
  SETTINGS = 'settings',
  TOOLS = 'tools',
  SEARCH_RESULTS = 'search_results',
  TODOS = 'todos'
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  category: '公告' | '活动' | '政策' | '文化';
  date: string;
  author: string;
  image: string;
  is_top?: boolean;
}

export interface Employee {
  id: string;
  account: string;
  job_number?: string;
  name: string;
  gender: string;
  department: string;
  role?: string;
  email: string;
  phone: string;
  location: string;
  avatar: string;
  status: string;
  portal_initial_password?: string | null;
  portal_account_auto_created?: boolean;
}

export interface QuickTool {
  id: string;
  name: string;
  icon: React.ReactNode;
  url: string;
  color: string;
  category?: string;
  description?: string;
}

export interface QuickToolDTO {
  id: number;
  name: string;
  icon_name: string;
  url: string;
  image?: string;
  color: string;
  category: string;
  description: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'info' | 'success' | 'warning' | 'reminder';
  isRead: boolean;
}

export interface Announcement {
  id: string;
  tag: string;
  title: string;
  content: string;
  time: string;
  color: 'orange' | 'blue' | 'rose' | 'emerald' | 'purple';
  is_urgent?: boolean;
}

export interface Permission {
  id: number;
  code: string;
  description: string;
}

export interface Role {
  id: number;
  code: string;
  name: string;
  description?: string;
  permissions?: Permission[];
}

export interface Department {
  id: number;
  name: string;
  parent_id: number | null;
  manager?: string;
  description?: string;
  children?: Department[];
}

export interface RoleCreate {
  code: string;
  name: string;
  description?: string;
  permission_ids: number[];
}

export interface RoleUpdate {
  name?: string;
  description?: string;
  permission_ids?: number[];
}

export interface User {
  id: number;
  username: string;
  email: string;
  account_type?: 'PORTAL' | 'SYSTEM';
  name?: string;
  avatar?: string;
  role?: string; // Deprecated
  roles: Role[];
  is_active: boolean;
}

export interface UserOption {
  id: number;
  username: string;
  name?: string;
  avatar?: string;
}

export interface SystemLog {
  id: number;
  level: 'INFO' | 'WARN' | 'ERROR';
  module: string;
  message: string;
  timestamp: string;
  // Extended Access Log Fields
  ip_address?: string;
  request_path?: string;
  method?: string;
  status_code?: number;
  response_time?: number;
  request_size?: number;
  user_agent?: string;
}

export interface BusinessLog {
  id: number;
  operator: string;
  action: string;
  target?: string;
  ip_address?: string;
  status: 'SUCCESS' | 'FAIL';
  detail?: string;
  source?: string;  // 日志来源: WEB, API, SYSTEM, LOKI
  timestamp: string;
}

export interface LogForwardingConfig {
  id: number;
  type: 'SYSLOG' | 'WEBHOOK';
  endpoint: string;
  port?: number;
  secret_token?: string;
  enabled: boolean;
  log_types?: string[];  // 要外发的日志类型
}

export interface CarouselItem {
  id: number;
  title: string;
  image: string;
  url: string;
  badge: string;
  sort_order: number;
  is_active: boolean;
}

export interface SystemResources {
  cpu_percent: number;
  memory_percent: number;
  memory_used: string;
  memory_total: string;
  disk_percent: number;
  network_sent_speed: number;
  network_recv_speed: number;
}

export interface StorageStats {
  used_bytes: number;
  total_bytes: number;
  free_bytes: number;
  used_percent: number;
  bucket_count: number;
  object_count: number;
}

export interface DashboardStats {
  system_visits: number;
  active_users: number;
  tool_clicks: number;
  new_content: number;
  activity_trend: string;
  active_users_trend: string;
  tool_clicks_trend: string;
  new_content_trend: string;
}

export interface AIModelOption {
  id: number;
  name: string;
  model: string;
  type: string;
  model_kind?: 'text' | 'multimodal';
}

export interface AIProvider {
  id: number;
  name: string;
  type: string; // 'openai' | 'gemini' | 'deepseek' | 'dashscope' | 'zhipu'
  model_kind: 'text' | 'multimodal';
  base_url?: string;
  api_key?: string; // write-only in backend create/update
  model: string;
  is_active: boolean;
  created_at?: string;
}

export interface AISecurityPolicy {
  id: number;
  name: string;
  type: string; // 'keyword' | 'regex' | 'length'
  content: string;
  action: string; // 'block' | 'mask' | 'audit'
  is_active: boolean;
}

export interface SystemInfo {
  software_name: string;
  version: string;
  status: string;
  database: string;
  license_id: string;
  authorized_unit: string;
  access_address: string;
  environment: string;
  copyright: string;
}

export interface SystemVersion {
  product: string;
  product_id?: string;
  version: string; // Full version (e.g. 2.5.0-beta.1)
  semver: string;  // Base version (e.g. 2.5.0)
  channel: string; // stable, beta, dev
  git_sha: string;
  dirty?: boolean;
  build_time: string;
  build_number?: string;
  build_id?: string;
  release_id?: string;
  api_version?: string;
  db_schema_version?: string;
}

export interface Todo {
  id: number;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'canceled';
  priority: number; // 0=Emergency, 1=High, 2=Medium, 3=Low
  due_at?: string; // ISO8601 UTC
  assignee_id: number;
  creator_id?: number;
  created_at: string;
  updated_at: string;
  assignee_name?: string;
  creator_name?: string;
}

export interface PaginatedTodoResponse {
  items: Todo[];
  total: number;
  page: number;
  page_size: number;
}
