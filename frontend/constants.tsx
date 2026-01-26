import {
  Users, CreditCard, LifeBuoy, FileText, Briefcase, Calendar,
  ShieldCheck, Mail, Globe, MessageSquare, PieChart, HardDrive
} from 'lucide-react';
import React from 'react';

// Static UI Configuration Data
export const DAILY_QUOTES = [
  "创新是区分领导者和跟随者的唯一标准。",
  "工作的最高境界是乐在其中。",
  "效率不是做得更快，而是把时间花在该做的事情上。",
  "团队的力量在于每个人的差异，而非共性。",
  "每一个不曾起舞的日子，都是对生命的辜负。"
];

export const CAROUSEL_ITEMS = [
  {
    id: 1,
    image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=1200',
    title: '2024 年度战略发布会圆满落幕',
    badge: '焦点新闻',
    url: '#'
  },
  {
    id: 2,
    image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200',
    title: 'ShiKu 义工日：我们在行动',
    badge: '企业责任',
    url: '#'
  },
  {
    id: 3,
    image: 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&q=80&w=1200',
    title: '新一代协作平台即将灰度测试',
    badge: '产品动态',
    url: '#'
  }
];


export const MOCK_NOTIFICATIONS: any[] = [
  { id: '1', type: 'success', content: '您的报销申请已通过审批', time: '10分钟前', isRead: false },
  { id: '2', type: 'warning', content: '请在今日下班前提交周报', time: '2小时前', isRead: false },
  { id: '3', type: 'reminder', content: '明天下午 14:00 参加全员大会', time: '1天前', isRead: true },
];
export const MOCK_ANNOUNCEMENTS: any[] = [];

