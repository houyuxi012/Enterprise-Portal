
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
  isUrgent?: boolean;
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
  role: string; // Deprecated
  roles: Role[];
  is_active: boolean;
}
