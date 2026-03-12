
import React from 'react';
import { 
  LayoutDashboard, Newspaper, Users, FolderOpen, Settings, Briefcase, 
  FileText, Calendar, CreditCard, LifeBuoy, ShieldCheck, Mail, 
  Globe, MessageSquare, PieChart, HardDrive, CheckSquare
} from 'lucide-react';
import { QuickTool, NewsItem, Employee, Notification, Announcement, TodoTask, Holiday } from './types';

export const QUICK_TOOLS: QuickTool[] = [
  { id: 'todo', name: '待办任务', icon: <CheckSquare size={20} />, url: '#', color: 'bg-indigo-100 text-indigo-600', category: '生产力', description: '管理您的日常工作清单' },
  { id: '1', name: '人事门户', icon: <Users size={20} />, url: '#', color: 'bg-blue-100 text-blue-600', category: '行政管理', description: '请假、入职及个人档案管理' },
  { id: '2', name: '报销管理', icon: <CreditCard size={20} />, url: '#', color: 'bg-emerald-100 text-emerald-600', category: '财务流程', description: '提交差旅及日常办公费用报销' },
  { id: '3', name: 'IT 支持', icon: <LifeBuoy size={20} />, url: '#', color: 'bg-orange-100 text-orange-600', category: '技术服务', description: '报修、设备申领及密码重置' },
  { id: '4', name: '文档中心', icon: <FileText size={20} />, url: '#', color: 'bg-purple-100 text-purple-600', category: '资源库', description: '公司模板、手册及共享文档' },
  { id: '5', name: '项目同步', icon: <Briefcase size={20} />, url: '#', color: 'bg-indigo-100 text-indigo-600', category: '生产力', description: '跨部门协作与进度跟踪' },
  { id: '6', name: '活动日历', icon: <Calendar size={20} />, url: '#', color: 'bg-rose-100 text-rose-600', category: '企业文化', description: '近期活动、放假安排及会议室预定' },
];

export const MOCK_TASKS: TodoTask[] = [
  { 
    id: 't1', 
    title: '关于 Q3 季度市场推广预算的审批申请', 
    dueDate: '2024-06-15', 
    priority: 'high', 
    source: 'OA系统',
    status: '待审批',
    requester: '陈莎莎',
    type: '费用报销'
  },
  { 
    id: 't2', 
    title: '核心交易系统数据库升级方案评审', 
    dueDate: '2024-06-12', 
    priority: 'medium', 
    source: 'Jira项目管理',
    status: '已完成',
    requester: '马库斯',
    type: '技术评审'
  },
  { 
    id: 't3', 
    title: '2024年度员工健康体检供应商合同审核', 
    dueDate: '2024-06-20', 
    priority: 'low', 
    source: '法务系统',
    status: '处理中',
    requester: '王汤姆',
    type: '合同审核'
  },
  { 
    id: 't4', 
    title: '新入职员工“艾莎”的转正申请审批', 
    dueDate: '2024-06-10', 
    priority: 'high', 
    source: 'HRM系统',
    status: '待审批',
    requester: '艾莎',
    type: '人事申请'
  },
];

export const MOCK_NEWS: NewsItem[] = [
  {
    id: '1',
    title: 'Q3 季度办公安全新规',
    summary: '从7月1日起，将更新工作场所安全与健康合规准则。',
    category: '政策',
    date: '2024-05-20',
    author: '安全部',
    image: 'https://picsum.photos/seed/safety/400/200'
  },
  {
    id: '2',
    title: '年度团建活动 - 开始早鸟报名',
    summary: '加入我们2024年的巴厘岛团建，现在报名即可预定机票偏好！',
    category: '活动',
    date: '2024-05-18',
    author: '企业文化组',
    image: 'https://picsum.photos/seed/retreat/400/200'
  },
  {
    id: '3',
    title: '季度财务报告：同比增长15%',
    summary: 'ShiKu Home 在市场扩张和客户满意度方面达到了新的里程碑。',
    category: '公告',
    date: '2024-05-15',
    author: '财务部',
    image: 'https://picsum.photos/seed/growth/400/200'
  }
];

export const MOCK_EMPLOYEES: Employee[] = [
  { id: '1', name: '陈莎莎', role: '产品设计主管', department: '设计部', email: 'sarah.c@shiku.com', avatar: 'https://i.pravatar.cc/150?u=sarah', status: '在线' },
  { id: '2', name: '马库斯', role: '高级工程师', department: '技术部', email: 'm.miller@shiku.com', avatar: 'https://i.pravatar.cc/150?u=marcus', status: '会议中' },
  { id: '3', name: '艾莎', role: '市场经理', department: '增长部', email: 'aisha.g@shiku.com', avatar: 'https://i.pravatar.cc/150?u=aisha', status: '在线' },
  { id: '4', name: '王汤姆', role: '人力资源专员', department: '人事部', email: 'tom.w@shiku.com', avatar: 'https://i.pravatar.cc/150?u=tom', status: '离线' },
];

export const DAILY_QUOTES = [
  "心之所向，素履以往。",
  "凡是过往，皆为序章。",
  "不积跬步，无以至千里。",
  "厚积薄发，行稳致远。",
  "创新是 ShiKu Home 的核心驱动力。",
  "每一个伟大的构思都源于平凡的坚持。",
  "在协作中发现更好的彼此。",
  "效率源于专注，品质源于匠心。"
];

export const CAROUSEL_ITEMS = [
  {
    id: 'c1',
    title: '探索 2024 全球峰会',
    image: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?q=80&w=1200&auto=format&fit=crop',
    url: '#',
    badge: '焦点'
  },
  {
    id: 'c2',
    title: '新一代协同工具发布',
    image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=1200&auto=format&fit=crop',
    url: '#',
    badge: '新品'
  },
  {
    id: 'c3',
    title: '绿色办公：从我做起',
    image: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?q=80&w=1200&auto=format&fit=crop',
    url: '#',
    badge: '倡议'
  }
];

export const MOCK_NOTIFICATIONS: Notification[] = [
  { id: 'n1', title: '提及了你', message: '陈莎莎在 "Q3 设计周" 项目中提及了你。', time: '2分钟前', type: 'info', isRead: false },
  { id: 'n2', title: '费用审批', message: '您的差旅报销单 #RE-9012 已经过审核。', time: '1小时前', type: 'success', isRead: false },
  { id: 'n3', title: '会议提醒', message: '与设计团队的周会将在 15 分钟内开始。', time: '12分钟前', type: 'reminder', isRead: false },
  { id: 'n4', title: '系统更新', message: 'IT 部门计划于今晚 23:00 进行系统维护。', time: '3小时前', type: 'warning', isRead: true },
];

export const MOCK_ANNOUNCEMENTS: Announcement[] = [
  { id: 'a1', tag: '美食', title: '今日主厨特供：松露牛肉', content: '今天午餐时段，公司食堂主厨将为您奉上精心准备的松露牛肉，欢迎品尝。', time: '刚才', color: 'orange' },
  { id: 'a2', tag: '维护', title: '5号会议室音响升级', content: '5号会议室正在进行音响系统维护，预计今日下午 16:00 前完成。', time: '20分钟前', color: 'blue' },
  { id: 'a3', tag: '行政', title: '端午节放假安排通知', content: '端午节放假时间为 6月8日至6月10日，共3天。请大家妥善安排工作。', time: '1小时前', color: 'emerald', isUrgent: true },
  { id: 'a4', tag: '招聘', title: '伯乐奖：推荐人才入职立奖', content: '公司急招高级前端工程师，内部推荐成功入职并过试用期可获得 5000 元奖金。', time: '3小时前', color: 'purple' },
  { id: 'a5', tag: 'IT', title: 'VPN 全面升级至 2.0 版本', content: '为了提供更稳定的远程办公体验，VPN 系统已升级。请及时下载新客户端。', time: '昨日', color: 'rose' },
];

export const MOCK_HOLIDAYS: Holiday[] = [
  { id: 'h1', name: '元旦', date: '2024-01-01', type: '法定节假日', description: '新年伊始，万象更新。' },
  { id: 'h2', name: '春节', date: '2024-02-10', endDate: '2024-02-17', type: '法定节假日', description: '阖家团圆，共贺新春。' },
  { id: 'h3', name: '清明节', date: '2024-04-04', endDate: '2024-04-06', type: '法定节假日', description: '慎终追远，缅怀先人。' },
  { id: 'h4', name: '劳动节', date: '2024-05-01', endDate: '2024-05-05', type: '法定节假日', description: '致敬劳动者。' },
  { id: 'h5', name: '端午节', date: '2024-06-08', endDate: '2024-06-10', type: '法定节假日', description: '粽叶飘香，龙舟竞渡。' },
  { id: 'h6', name: '中秋节', date: '2024-09-15', endDate: '2024-09-17', type: '法定节假日', description: '月满中秋，情系家园。' },
  { id: 'h7', name: '国庆节', date: '2024-10-01', endDate: '2024-10-07', type: '法定节假日', description: '欢度国庆，盛世中华。' },
  { id: 'h8', name: '公司周年庆', date: '2024-11-11', type: '公司福利假', description: '庆祝 ShiKu Home 成立周年。' },
  { id: 'h9', name: '春节调休', date: '2024-02-04', type: '调休工作日', description: '春节假期调休。' },
  { id: 'h10', name: '春节调休', date: '2024-02-18', type: '调休工作日', description: '春节假期调休。' },
];
