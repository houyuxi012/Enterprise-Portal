import type { Announcement, Notification } from '@/types';

// Static UI Configuration Data
export const DAILY_QUOTES = [
  'dashboardHome.quotes.quote1',
  'dashboardHome.quotes.quote2',
  'dashboardHome.quotes.quote3',
  'dashboardHome.quotes.quote4',
  'dashboardHome.quotes.quote5'
];

export const CAROUSEL_ITEMS = [
  {
    id: 1,
    image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=1200',
    title: '2024 Strategy Conference Successfully Concluded',
    badge: 'Headline',
    url: '#'
  },
  {
    id: 2,
    image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200',
    title: 'ShiKu Volunteer Day: We Are Taking Action',
    badge: 'Corporate Responsibility',
    url: '#'
  },
  {
    id: 3,
    image: 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&q=80&w=1200',
    title: 'Next-Generation Collaboration Platform Entering Canary Test',
    badge: 'Product Updates',
    url: '#'
  }
];


export const MOCK_NOTIFICATIONS: Notification[] = [];
export const MOCK_ANNOUNCEMENTS: Announcement[] = [];
