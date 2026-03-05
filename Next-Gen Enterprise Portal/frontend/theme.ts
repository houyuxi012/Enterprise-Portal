import type { ThemeConfig } from 'antd';
import {
  appThemeTokens,
  colorTokens,
  motionTokens,
  shadowTokens,
  sizeTokens,
} from './theme/tokens';

/**
 * Admin Design System - 统一主题配置
 *
 * 主题具体值统一从 `theme/tokens.ts` 提供，
 * 这里仅做 antd ThemeConfig 组装，避免重复定义。
 */
export const themeConfig: ThemeConfig = {
  token: {
    ...appThemeTokens,
    boxShadow: shadowTokens.primary,
    boxShadowSecondary: shadowTokens.secondary,
    motionDurationFast: motionTokens.fast,
    motionDurationMid: motionTokens.mid,
    motionDurationSlow: motionTokens.slow,
  },

  components: {
    Button: {
      borderRadius: sizeTokens.borderRadius,
      controlHeight: sizeTokens.controlHeight,
      controlHeightSM: sizeTokens.controlHeightSM,
      controlHeightLG: sizeTokens.controlHeightLG,
      paddingInline: sizeTokens.padding,
      paddingInlineSM: sizeTokens.paddingSM,
      paddingInlineLG: 20,
      fontWeight: 500,
    },

    Table: {
      headerBg: colorTokens.bgLayout,
      headerColor: colorTokens.label,
      headerSortActiveBg: colorTokens.borderLight,
      headerSortHoverBg: colorTokens.border,
      rowHoverBg: colorTokens.bgLayout,
      borderColor: colorTokens.border,
      cellPaddingBlock: sizeTokens.paddingSM,
      cellPaddingInline: sizeTokens.padding,
      cellFontSize: sizeTokens.fontSize,
      headerBorderRadius: sizeTokens.borderRadius,
    },

    Form: {
      labelColor: colorTokens.label,
      labelFontSize: sizeTokens.fontSize,
      itemMarginBottom: 20,
      verticalLabelPadding: '0 0 8px',
    },

    Modal: {
      borderRadiusLG: 16,
      titleFontSize: 18,
      titleLineHeight: 1.5,
      headerBg: colorTokens.bgContainer,
      contentBg: colorTokens.bgContainer,
      footerBg: colorTokens.bgContainer,
    },

    Drawer: {
      borderRadiusLG: 16,
      footerPaddingBlock: sizeTokens.padding,
      footerPaddingInline: sizeTokens.paddingLG,
    },

    Input: {
      borderRadius: sizeTokens.borderRadius,
      controlHeight: sizeTokens.controlHeight,
      controlHeightSM: sizeTokens.controlHeightSM,
      controlHeightLG: sizeTokens.controlHeightLG,
      paddingInline: 12,
      activeShadow: `0 0 0 2px rgba(22, 119, 255, 0.1)`,
    },

    Select: {
      borderRadius: sizeTokens.borderRadius,
      controlHeight: sizeTokens.controlHeight,
      controlHeightSM: sizeTokens.controlHeightSM,
      controlHeightLG: sizeTokens.controlHeightLG,
      optionPadding: '8px 12px',
    },

    Tag: {
      borderRadiusSM: sizeTokens.borderRadiusSM,
      defaultBg: colorTokens.borderLight,
      defaultColor: colorTokens.label,
    },

    Card: {
      borderRadiusLG: sizeTokens.borderRadiusLG,
      paddingLG: sizeTokens.paddingLG,
      headerFontSize: sizeTokens.fontSizeLG,
    },

    Tabs: {
      borderRadius: sizeTokens.borderRadius,
      titleFontSize: sizeTokens.fontSize,
      titleFontSizeSM: sizeTokens.fontSizeSM,
      titleFontSizeLG: sizeTokens.fontSizeLG,
    },

    Pagination: {
      borderRadius: sizeTokens.borderRadiusSM,
      itemSize: 32,
      itemSizeSM: 24,
    },

    DatePicker: {
      borderRadius: sizeTokens.borderRadius,
      controlHeight: sizeTokens.controlHeight,
    },

    Menu: {
      itemBorderRadius: sizeTokens.borderRadius,
      itemMarginInline: sizeTokens.paddingXS,
      subMenuItemBg: 'transparent',
    },

    Message: {
      borderRadiusLG: sizeTokens.borderRadius,
    },

    Notification: {
      borderRadiusLG: sizeTokens.borderRadiusLG,
    },

    Popover: {
      borderRadiusLG: sizeTokens.borderRadiusLG,
    },

    Tooltip: {
      borderRadius: sizeTokens.borderRadiusSM,
    },

    Switch: {
      trackHeight: 22,
      trackMinWidth: 44,
      handleSize: 18,
    },

    Checkbox: {
      borderRadiusSM: sizeTokens.borderRadiusXS,
    },

    Radio: {
      radioSize: 16,
    },

    Statistic: {
      titleFontSize: sizeTokens.fontSize,
      contentFontSize: 24,
    },

    Steps: {
      iconSize: 32,
      iconFontSize: sizeTokens.fontSize,
    },

    Progress: {
      circleTextFontSize: '1em',
    },

    Empty: {
      colorText: colorTokens.textTertiary,
      colorTextDisabled: colorTokens.textQuaternary,
    },
  },
};

export const colors = {
  primary: colorTokens.primary,
  success: colorTokens.success,
  warning: colorTokens.warning,
  error: colorTokens.error,
  info: colorTokens.info,
  text: colorTokens.text,
  textSecondary: colorTokens.textSecondary,
  textTertiary: colorTokens.textTertiary,
  border: colorTokens.border,
  borderLight: colorTokens.borderLight,
  bgContainer: colorTokens.bgContainer,
  bgLayout: colorTokens.bgLayout,
  bgHover: colorTokens.bgHover,
} as const;

export const sizes = {
  controlHeight: sizeTokens.controlHeight,
  controlHeightSM: sizeTokens.controlHeightSM,
  controlHeightLG: sizeTokens.controlHeightLG,
  borderRadius: sizeTokens.borderRadius,
  borderRadiusSM: sizeTokens.borderRadiusSM,
  borderRadiusLG: sizeTokens.borderRadiusLG,
  fontSize: sizeTokens.fontSize,
  fontSizeSM: sizeTokens.fontSizeSM,
  fontSizeLG: sizeTokens.fontSizeLG,
} as const;

export default themeConfig;
