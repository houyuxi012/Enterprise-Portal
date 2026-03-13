import React from 'react';
import { ArrowLeft, CalendarDays, Target, Sparkles, MessageSquare, Award, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { HolidayReminder } from '@/types';

interface HolidayDetailProps {
  holiday: HolidayReminder | { countdown: string; message: string; color: string; coverImage?: string; name: string; date: string } | null;
  onBack: () => void;
}

type AchievementCardConfig = {
  eyebrow?: string | null;
  icon?: string | null;
  stat?: string | null;
  stat_caption?: string | null;
  progress_left_label?: string | null;
  progress_right_label?: string | null;
  progress?: number | null;
};

const ACHIEVEMENT_ICONS = {
  award: Award,
  sparkles: Sparkles,
  target: Target,
} as const;

const HOLIDAY_THEME_MAP: Record<HolidayReminder['color'], {
  heroGradient: string;
  heroOverlay: string;
  heroBadge: string;
  accent: string;
  accentSoft: string;
  accentBorder: string;
  accentShadow: string;
  achievementBg: string;
  achievementIcon: string;
}> = {
  purple: {
    heroGradient: 'linear-gradient(135deg, #4c1d95 0%, #7c3aed 55%, #a855f7 100%)',
    heroOverlay: 'linear-gradient(to top, rgba(76, 29, 149, 0.92) 0%, rgba(76, 29, 149, 0.08) 55%, rgba(76, 29, 149, 0) 100%)',
    heroBadge: 'rgba(255,255,255,0.18)',
    accent: '#7c3aed',
    accentSoft: '#f3e8ff',
    accentBorder: '#e9d5ff',
    accentShadow: 'rgba(124, 58, 237, 0.24)',
    achievementBg: '#7c3aed',
    achievementIcon: '#fbbf24',
  },
  blue: {
    heroGradient: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 55%, #3b82f6 100%)',
    heroOverlay: 'linear-gradient(to top, rgba(30, 58, 138, 0.92) 0%, rgba(30, 58, 138, 0.08) 55%, rgba(30, 58, 138, 0) 100%)',
    heroBadge: 'rgba(255,255,255,0.18)',
    accent: '#2563eb',
    accentSoft: '#eff6ff',
    accentBorder: '#bfdbfe',
    accentShadow: 'rgba(37, 99, 235, 0.24)',
    achievementBg: '#2563eb',
    achievementIcon: '#fbbf24',
  },
  emerald: {
    heroGradient: 'linear-gradient(135deg, #064e3b 0%, #047857 55%, #10b981 100%)',
    heroOverlay: 'linear-gradient(to top, rgba(6, 78, 59, 0.92) 0%, rgba(6, 78, 59, 0.08) 55%, rgba(6, 78, 59, 0) 100%)',
    heroBadge: 'rgba(255,255,255,0.18)',
    accent: '#059669',
    accentSoft: '#ecfdf5',
    accentBorder: '#a7f3d0',
    accentShadow: 'rgba(5, 150, 105, 0.24)',
    achievementBg: '#059669',
    achievementIcon: '#fbbf24',
  },
  green: {
    heroGradient: 'linear-gradient(135deg, #14532d 0%, #15803d 55%, #22c55e 100%)',
    heroOverlay: 'linear-gradient(to top, rgba(20, 83, 45, 0.92) 0%, rgba(20, 83, 45, 0.08) 55%, rgba(20, 83, 45, 0) 100%)',
    heroBadge: 'rgba(255,255,255,0.18)',
    accent: '#16a34a',
    accentSoft: '#f0fdf4',
    accentBorder: '#bbf7d0',
    accentShadow: 'rgba(22, 163, 74, 0.24)',
    achievementBg: '#16a34a',
    achievementIcon: '#fbbf24',
  },
  yellow: {
    heroGradient: 'linear-gradient(135deg, #92400e 0%, #d97706 55%, #f59e0b 100%)',
    heroOverlay: 'linear-gradient(to top, rgba(120, 53, 15, 0.88) 0%, rgba(120, 53, 15, 0.08) 55%, rgba(120, 53, 15, 0) 100%)',
    heroBadge: 'rgba(255,255,255,0.18)',
    accent: '#d97706',
    accentSoft: '#fffbeb',
    accentBorder: '#fde68a',
    accentShadow: 'rgba(217, 119, 6, 0.24)',
    achievementBg: '#d97706',
    achievementIcon: '#fde68a',
  },
  orange: {
    heroGradient: 'linear-gradient(135deg, #9a3412 0%, #ea580c 55%, #fb923c 100%)',
    heroOverlay: 'linear-gradient(to top, rgba(124, 45, 18, 0.9) 0%, rgba(124, 45, 18, 0.08) 55%, rgba(124, 45, 18, 0) 100%)',
    heroBadge: 'rgba(255,255,255,0.18)',
    accent: '#ea580c',
    accentSoft: '#fff7ed',
    accentBorder: '#fdba74',
    accentShadow: 'rgba(234, 88, 12, 0.24)',
    achievementBg: '#ea580c',
    achievementIcon: '#fde68a',
  },
  red: {
    heroGradient: 'linear-gradient(135deg, #7f1d1d 0%, #dc2626 55%, #ef4444 100%)',
    heroOverlay: 'linear-gradient(to top, rgba(127, 29, 29, 0.9) 0%, rgba(127, 29, 29, 0.08) 55%, rgba(127, 29, 29, 0) 100%)',
    heroBadge: 'rgba(255,255,255,0.18)',
    accent: '#dc2626',
    accentSoft: '#fef2f2',
    accentBorder: '#fecaca',
    accentShadow: 'rgba(220, 38, 38, 0.24)',
    achievementBg: '#dc2626',
    achievementIcon: '#fde68a',
  },
  rose: {
    heroGradient: 'linear-gradient(135deg, #881337 0%, #e11d48 55%, #f43f5e 100%)',
    heroOverlay: 'linear-gradient(to top, rgba(136, 19, 55, 0.9) 0%, rgba(136, 19, 55, 0.08) 55%, rgba(136, 19, 55, 0) 100%)',
    heroBadge: 'rgba(255,255,255,0.18)',
    accent: '#e11d48',
    accentSoft: '#fff1f2',
    accentBorder: '#fecdd3',
    accentShadow: 'rgba(225, 29, 72, 0.24)',
    achievementBg: '#e11d48',
    achievementIcon: '#fde68a',
  },
};

const HolidayDetail: React.FC<HolidayDetailProps> = ({ holiday, onBack }) => {
  const { t } = useTranslation();

  if (!holiday) {
    return null;
  }

  const localContent = (holiday as { local_content_config?: Record<string, unknown> }).local_content_config || {};
  const heroTitle = String(localContent.hero_title || holiday.name || '').trim() || '节日活动';
  const sectionTitle = String(localContent.section_title || holiday.name || '').trim() || '节日活动';
  const dateStr = holiday.date ? `${holiday.date} · ${holiday.name}` : holiday.name;
  const message = String(localContent.intro_content || holiday.message || '').trim();
  const cover = String(
    localContent.cover_image
    || (holiday as { cover_image?: string | null }).cover_image
    || '',
  ).trim();
  const activityOneTitle = String(localContent.activity_one_title || '线上节日活动').trim();
  const activityOneDesc = String(localContent.activity_one_desc || '活动详情待补充。').trim();
  const activityTwoTitle = String(localContent.activity_two_title || '线下节日活动').trim();
  const activityTwoDesc = String(localContent.activity_two_desc || '活动详情待补充。').trim();
  const tipsTitle = String(localContent.tips_title || '节日提示').trim();
  const tipsItems = String(localContent.tips_items || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
  const ownerAvatar = String(localContent.owner_avatar || '').trim();
  const ownerName = String(localContent.owner_name || '活动负责人').trim();
  const ownerRole = String(localContent.owner_role || 'Holiday Coordinator').trim();
  const contactButtonText = String(localContent.contact_button_text || t('dashboardHome.sections.viewDetails', '节日活动')).trim();
  const parsedAchievementCard = (() => {
    const raw = localContent.achievement_card_json;
    if (typeof raw === 'string' && raw.trim()) {
      try {
        return JSON.parse(raw) as AchievementCardConfig;
      } catch {
        return null;
      }
    }
    if (raw && typeof raw === 'object') {
      return raw as AchievementCardConfig;
    }
    return null;
  })();
  const achievementMarkdown = String(localContent.achievement_card_markdown || '').trim();
  const hasAchievementConfig = Boolean(parsedAchievementCard || achievementMarkdown);
  const achievementIconKey = hasAchievementConfig
    ? String(parsedAchievementCard?.icon || 'award').toLowerCase() as keyof typeof ACHIEVEMENT_ICONS
    : null;
  const AchievementIcon = achievementIconKey ? (ACHIEVEMENT_ICONS[achievementIconKey] || Award) : null;
  const achievementEyebrow = hasAchievementConfig
    ? String(parsedAchievementCard?.eyebrow || '').trim()
    : '';
  const achievementValue = hasAchievementConfig
    ? String(parsedAchievementCard?.stat || '').trim()
    : '';
  const achievementCaption = hasAchievementConfig
    ? String(parsedAchievementCard?.stat_caption || '').trim()
    : '';
  const progressLeftLabel = hasAchievementConfig
    ? String(parsedAchievementCard?.progress_left_label || '').trim()
    : '';
  const progressRightLabel = hasAchievementConfig
    ? String(parsedAchievementCard?.progress_right_label || '').trim()
    : '';
  const targetProgress = hasAchievementConfig
    ? Math.max(0, Math.min(100, Number(parsedAchievementCard?.progress ?? 0) || 0))
    : 0;
  const showProgress = hasAchievementConfig && (progressLeftLabel || progressRightLabel || targetProgress > 0);
  const theme = HOLIDAY_THEME_MAP[holiday.color] || HOLIDAY_THEME_MAP.emerald;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 pb-20 max-w-6xl mx-auto w-full">
      <button 
        onClick={onBack}
        className="flex items-center space-x-2 text-slate-400 hover:text-indigo-600 transition-colors mb-8 group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        <span className="text-[10px] font-black uppercase tracking-widest">{t('common.actions.backToHome', '返回概览')}</span>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-8 space-y-12">
          <div className="relative h-[400px] rounded-[3rem] overflow-hidden shadow-2xl">
            {cover ? (
              <img
                src={cover}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="h-full w-full" style={{ background: theme.heroGradient }} />
            )}
            <div className="absolute inset-0" style={{ background: theme.heroOverlay }}></div>
            <div className="absolute bottom-10 left-10">
              <div className="flex items-center space-x-3 mb-4">
                <span
                  className="px-4 py-1.5 backdrop-blur-md text-white text-[10px] font-black rounded-full uppercase tracking-widest border border-white/20"
                  style={{ backgroundColor: theme.heroBadge }}
                >
                  节日专题
                </span>
                <span className="text-white/60 text-[10px] font-bold uppercase tracking-widest">{dateStr}</span>
              </div>
              <h1 className="text-5xl font-black text-white tracking-tighter leading-none whitespace-pre-line">{heroTitle}</h1>
            </div>
          </div>

          <div className="mica p-10 rounded-[3rem] border border-white/50 space-y-8">
            <div className="prose prose-slate dark:prose-invert max-w-none">
              <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mb-6">{sectionTitle}</h2>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
                {message}
              </p>
              
              <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight mb-4">{t('holidayReminderList.steps.activity', '节日活动配置')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 mt-6">
                <div
                  className="p-6 rounded-3xl m-0"
                  style={{ backgroundColor: theme.accentSoft, border: `1px solid ${theme.accentBorder}` }}
                >
                  <div
                    className="w-10 h-10 text-white rounded-xl flex items-center justify-center mb-4 shadow-lg"
                    style={{ backgroundColor: theme.accent, boxShadow: `0 12px 24px ${theme.accentShadow}` }}
                  >
                    <CalendarDays size={20} />
                  </div>
                  <h4 className="font-black text-slate-900 dark:text-white mb-2 mt-0">{activityOneTitle}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 m-0">{activityOneDesc}</p>
                </div>
                <div
                  className="p-6 rounded-3xl m-0"
                  style={{ backgroundColor: theme.accentSoft, border: `1px solid ${theme.accentBorder}` }}
                >
                  <div
                    className="w-10 h-10 text-white rounded-xl flex items-center justify-center mb-4 shadow-lg"
                    style={{ backgroundColor: theme.accent, boxShadow: `0 12px 24px ${theme.accentShadow}` }}
                  >
                    <Target size={20} />
                  </div>
                  <h4 className="font-black text-slate-900 dark:text-white mb-2 mt-0">{activityTwoTitle}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 m-0">{activityTwoDesc}</p>
                </div>
              </div>

              <div className="p-8 bg-slate-900 rounded-[2rem] text-white relative overflow-hidden mt-8">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                  <Sparkles size={120} />
                </div>
                <h3 className="text-xl font-black mb-4 relative z-10 m-0 text-white">{tipsTitle}</h3>
                <ul className="space-y-3 text-slate-300 text-sm relative z-10 m-0 p-0 list-none">
                  {(tipsItems.length > 0 ? tipsItems : ['活动提示待补充。']).map((item) => (
                    <li key={item} className="flex items-start space-x-3 m-0 p-0 before:hidden">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 shrink-0"></div>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-8">
          <div className="mica p-8 rounded-[2.5rem] border border-white/50 shadow-xl">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-6">活动负责人</h3>
            <div className="flex items-center space-x-4 mb-8">
              {ownerAvatar ? (
                <img
                  src={ownerAvatar}
                  className="w-14 h-14 rounded-2xl object-cover shadow-lg"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-slate-200/70 dark:bg-slate-700/60 shadow-lg flex items-center justify-center text-slate-400">
                  <User size={18} />
                </div>
              )}
              <div>
                <p className="text-base font-black text-slate-900 dark:text-white leading-none">{ownerName}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{ownerRole}</p>
              </div>
            </div>
            <button className="w-full py-4 bg-slate-100 dark:bg-white/5 hover:bg-indigo-600 hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center space-x-2">
              <MessageSquare size={14} />
              <span>{contactButtonText}</span>
            </button>
          </div>

          {hasAchievementConfig ? (
            <div className="mica p-8 rounded-[2.5rem] border border-white/50 shadow-xl text-white" style={{ backgroundColor: theme.achievementBg }}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-[10px] font-black uppercase tracking-widest opacity-80">{achievementEyebrow}</h3>
                {AchievementIcon ? (
                  <AchievementIcon size={20} style={{ color: theme.achievementIcon }} />
                ) : null}
              </div>
              {achievementValue ? (
                <p className="text-3xl font-black tracking-tighter mb-2">{achievementValue}</p>
              ) : null}
              {achievementCaption ? (
                <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">{achievementCaption}</p>
              ) : null}
              {(showProgress || achievementMarkdown) ? (
                <div className="mt-8 pt-8 border-t border-white/10">
                  {showProgress ? (
                    <>
                      {(progressLeftLabel || progressRightLabel) ? (
                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-2">
                          <span>{progressLeftLabel}</span>
                          <span>{progressRightLabel}</span>
                        </div>
                      ) : null}
                      <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                        <div className="h-full bg-white" style={{ width: `${targetProgress}%` }}></div>
                      </div>
                    </>
                  ) : null}
                  {achievementMarkdown ? (
                    <div className="prose prose-invert prose-p:my-2 prose-strong:text-white prose-headings:text-white prose-li:text-white/90 max-w-none mt-6 text-sm">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {achievementMarkdown}
                      </ReactMarkdown>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default HolidayDetail;
