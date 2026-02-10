
import React from 'react';

export enum AppView {
  DASHBOARD = 'dashboard',
  NEWS = 'news',
  DIRECTORY = 'directory',
  RESOURCES = 'resources',
  SETTINGS = 'settings',
  TOOLS = 'tools',
  SEARCH_RESULTS = 'search_results'
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
  job_number: string;
  name: string;
  gender: string;
  department: string;
  role: string;
  email: string;
  phone: string;
  location: string;
  avatar: string;
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
  name?: string;
  avatar?: string;
  role: string; // Deprecated
  roles: Role[];
  is_active: boolean;
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
}

export interface AIProvider {
  id: number;
  name: string;
  type: string; // 'google' | 'openai' | 'anthropic' | 'deepseek' | 'custom'
  api_base?: string;
  api_key?: string; // Masked when returned
  model_name: string;
  is_active: boolean;
  priority: number;
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
