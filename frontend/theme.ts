import type { ThemeConfig } from 'antd';

/**
 * Admin Design System - 统一主题配置
 * 
 * 包含全局 tokens 和组件级 tokens
 * 业务页面禁止直接使用 antd 原组件或自定义 style 颜色/尺寸
 */

export const themeConfig: ThemeConfig = {
    // ===== 全局 Tokens =====
    token: {
        // 品牌色
        colorPrimary: '#1677ff',
        colorSuccess: '#52c41a',
        colorWarning: '#faad14',
        colorError: '#ff4d4f',
        colorInfo: '#1677ff',

        // 中性色
        colorText: '#1f2937',
        colorTextSecondary: '#64748b',
        colorTextTertiary: '#94a3b8',
        colorTextQuaternary: '#cbd5e1',
        colorBorder: '#e2e8f0',
        colorBorderSecondary: '#f1f5f9',
        colorBgContainer: '#ffffff',
        colorBgLayout: '#f8fafc',
        colorBgSpotlight: '#f1f5f9',

        // 圆角
        borderRadius: 8,
        borderRadiusSM: 6,
        borderRadiusLG: 12,
        borderRadiusXS: 4,

        // 控件高度
        controlHeight: 36,
        controlHeightSM: 28,
        controlHeightLG: 44,
        controlHeightXS: 24,

        // 字号
        fontSize: 14,
        fontSizeSM: 12,
        fontSizeLG: 16,
        fontSizeXL: 20,
        fontSizeHeading1: 32,
        fontSizeHeading2: 24,
        fontSizeHeading3: 20,
        fontSizeHeading4: 16,
        fontSizeHeading5: 14,

        // 间距
        padding: 16,
        paddingSM: 12,
        paddingLG: 24,
        paddingXS: 8,
        paddingXXS: 4,

        margin: 16,
        marginSM: 12,
        marginLG: 24,
        marginXS: 8,
        marginXXS: 4,

        // 阴影
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)',
        boxShadowSecondary: '0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 9px 28px 8px rgba(0, 0, 0, 0.05)',

        // 动画
        motionDurationFast: '0.1s',
        motionDurationMid: '0.2s',
        motionDurationSlow: '0.3s',
    },

    // ===== 组件级 Tokens =====
    components: {
        Button: {
            borderRadius: 8,
            controlHeight: 36,
            controlHeightSM: 28,
            controlHeightLG: 44,
            paddingInline: 16,
            paddingInlineSM: 12,
            paddingInlineLG: 20,
            fontWeight: 500,
        },

        Table: {
            headerBg: '#f8fafc',
            headerColor: '#475569',
            headerSortActiveBg: '#f1f5f9',
            headerSortHoverBg: '#e2e8f0',
            rowHoverBg: '#f8fafc',
            borderColor: '#e2e8f0',
            cellPaddingBlock: 12,
            cellPaddingInline: 16,
            cellFontSize: 14,
            headerBorderRadius: 8,
        },

        Form: {
            labelColor: '#475569',
            labelFontSize: 14,
            itemMarginBottom: 20,
            verticalLabelPadding: '0 0 8px',
        },

        Modal: {
            borderRadiusLG: 16,
            titleFontSize: 18,
            titleLineHeight: 1.5,
            headerBg: '#ffffff',
            contentBg: '#ffffff',
            footerBg: '#ffffff',
        },

        Drawer: {
            borderRadiusLG: 16,
            footerPaddingBlock: 16,
            footerPaddingInline: 24,
        },

        Input: {
            borderRadius: 8,
            controlHeight: 36,
            controlHeightSM: 28,
            controlHeightLG: 44,
            paddingInline: 12,
            activeShadow: '0 0 0 2px rgba(22, 119, 255, 0.1)',
        },

        Select: {
            borderRadius: 8,
            controlHeight: 36,
            controlHeightSM: 28,
            controlHeightLG: 44,
            optionPadding: '8px 12px',
        },

        Tag: {
            borderRadiusSM: 6,
            defaultBg: '#f1f5f9',
            defaultColor: '#475569',
        },

        Card: {
            borderRadiusLG: 12,
            paddingLG: 24,
            headerFontSize: 16,
        },

        Tabs: {
            borderRadius: 8,
            titleFontSize: 14,
            titleFontSizeSM: 12,
            titleFontSizeLG: 16,
        },

        Pagination: {
            borderRadius: 6,
            itemSize: 32,
            itemSizeSM: 24,
        },

        DatePicker: {
            borderRadius: 8,
            controlHeight: 36,
        },

        Menu: {
            itemBorderRadius: 8,
            itemMarginInline: 8,
            subMenuItemBg: 'transparent',
        },

        Message: {
            borderRadiusLG: 8,
        },

        Notification: {
            borderRadiusLG: 12,
        },

        Popover: {
            borderRadiusLG: 12,
        },

        Tooltip: {
            borderRadius: 6,
        },

        Switch: {
            trackHeight: 22,
            trackMinWidth: 44,
            handleSize: 18,
        },

        Checkbox: {
            borderRadiusSM: 4,
        },

        Radio: {
            radioSize: 16,
        },

        Statistic: {
            titleFontSize: 14,
            contentFontSize: 24,
        },

        Steps: {
            iconSize: 32,
            iconFontSize: 14,
        },

        Progress: {
            circleTextFontSize: '1em',
        },

        Empty: {
            colorText: '#94a3b8',
            colorTextDisabled: '#cbd5e1',
        },
    },
};

// 导出常用颜色常量，供组件内部使用
export const colors = {
    primary: '#1677ff',
    success: '#52c41a',
    warning: '#faad14',
    error: '#ff4d4f',
    info: '#1677ff',

    text: '#1f2937',
    textSecondary: '#64748b',
    textTertiary: '#94a3b8',

    border: '#e2e8f0',
    borderLight: '#f1f5f9',

    bgContainer: '#ffffff',
    bgLayout: '#f8fafc',
    bgHover: '#f1f5f9',
} as const;

// 导出尺寸常量
export const sizes = {
    controlHeight: 36,
    controlHeightSM: 28,
    controlHeightLG: 44,

    borderRadius: 8,
    borderRadiusSM: 6,
    borderRadiusLG: 12,

    fontSize: 14,
    fontSizeSM: 12,
    fontSizeLG: 16,
} as const;

export default themeConfig;
