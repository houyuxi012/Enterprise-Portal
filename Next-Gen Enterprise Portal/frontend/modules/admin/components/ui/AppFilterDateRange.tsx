import React from 'react';
import DatePicker from 'antd/es/date-picker';
import Space from 'antd/es/space';
import Typography from 'antd/es/typography';
import type { Dayjs } from 'dayjs';
import type { DatePickerProps } from 'antd/es/date-picker';
import type { FilterDateRangeProps } from './AppFilterBar';

const { Text } = Typography;

const formatDateString = (
  value: Dayjs | null,
  format?: DatePickerProps['format'],
): string => {
  if (!value) return '';
  if (typeof format === 'string') return value.format(format);
  return value.toISOString();
};

const AppFilterDateRange: React.FC<FilterDateRangeProps> = ({
  className = '',
  value,
  onChange,
  placeholder,
  format,
  showTime,
  disabled,
  allowEmpty = [true, true],
}) => {
  const currentValue: [Dayjs | null, Dayjs | null] = value || [null, null];

  const emitChange = (nextValue: [Dayjs | null, Dayjs | null]) => {
    const hasValue = Boolean(nextValue[0] || nextValue[1]);
    const normalized = hasValue ? nextValue : null;
    onChange?.(normalized, [
      formatDateString(nextValue[0], format),
      formatDateString(nextValue[1], format),
    ]);
  };

  return (
    <Space.Compact className={`app-filter-date-range ${className}`.trim()}>
      <DatePicker
        value={currentValue[0]}
        onChange={(date) => emitChange([date, currentValue[1]])}
        placeholder={placeholder?.[0]}
        format={format}
        showTime={showTime}
        disabled={disabled}
        allowClear={allowEmpty[0]}
      />
      <Text type="secondary" className="px-2 leading-8">
        -
      </Text>
      <DatePicker
        value={currentValue[1]}
        onChange={(date) => emitChange([currentValue[0], date])}
        placeholder={placeholder?.[1]}
        format={format}
        showTime={showTime}
        disabled={disabled}
        allowClear={allowEmpty[1]}
      />
    </Space.Compact>
  );
};

export default AppFilterDateRange;
