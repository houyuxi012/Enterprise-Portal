
import React from 'react';

export enum AppView {
  DASHBOARD = 'dashboard',
  NEWS = 'news',
  DIRECTORY = 'directory',
  RESOURCES = 'resources',
  SETTINGS = 'settings',
  TOOLS = 'tools',
  SEARCH_RESULTS = 'search_results',
  ADMIN = 'admin',
  ABOUT = 'about',
  LEAVE_REQUEST = 'leave_request',
  TODO = 'todo',
  PROFILE = 'profile'
}

export interface TodoTask {
  id: string;
  title: string;
  dueDate: string;
  priority: 'high' | 'medium' | 'low';
  completed: boolean;
  category: string;
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  category: '公告' | '活动' | '政策' | '文化' | '技术';
  date: string;
  author: string;
  image: string;
  content?: string;
  tags?: string[];
  readTime?: string;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  department: string;
  email: string;
  avatar: string;
  status: '在线' | '离线' | '会议中';
  bio?: string;
  skills?: string[];
  projects?: string[];
  location?: string;
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
