export const colorTokens = {
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

export const sizeTokens = {
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

export const appThemeTokens = {
  colorPrimary: colorTokens.primary,
  colorSuccess: colorTokens.success,
  colorWarning: colorTokens.warning,
  colorError: colorTokens.error,
  colorInfo: colorTokens.info,
  colorText: colorTokens.text,
  colorTextSecondary: colorTokens.textSecondary,
  colorTextTertiary: colorTokens.textTertiary,
  colorBorder: colorTokens.border,
  colorBorderSecondary: colorTokens.borderLight,
  colorBgContainer: colorTokens.bgContainer,
  colorBgLayout: colorTokens.bgLayout,
} as const;
