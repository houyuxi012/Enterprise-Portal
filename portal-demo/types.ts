
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
  PROFILE = 'profile',
  HOLIDAYS = 'holidays'
}

export interface TodoTask {
  id: string;
  title: string;
  dueDate: string;
  priority: 'high' | 'medium' | 'low';
  source: string; // e.g., 'OA系统', 'CRM系统', 'ERP系统'
  status: '待审批' | '处理中' | '已完成' | '已驳回';
  requester: string;
  type: string; // e.g., '请假申请', '合同审核', '费用报销'
}

export interface Holiday {
  id: string;
  name: string;
  date: string;
  endDate?: string;
  type: '法定节假日' | '公司福利假' | '调休工作日';
  description?: string;
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
