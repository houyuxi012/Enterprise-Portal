import React, { useRef } from 'react';
import { UploadOutlined } from '@ant-design/icons';
import { AppButton } from '@/modules/admin/components/ui';

type AppButtonProps = React.ComponentProps<typeof AppButton>;

interface UploadTriggerButtonProps {
  accept?: string;
  buttonLabel: React.ReactNode;
  disabled?: boolean;
  icon?: React.ReactNode;
  intent?: AppButtonProps['intent'];
  loading?: boolean;
  onSelect: (file: File) => Promise<void> | void;
  size?: AppButtonProps['size'];
}

const UploadTriggerButton: React.FC<UploadTriggerButtonProps> = ({
  accept,
  buttonLabel,
  disabled = false,
  icon,
  intent = 'secondary',
  loading = false,
  onSelect,
  size,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) {
            return;
          }
          await onSelect(file);
        }}
      />
      <AppButton
        disabled={disabled}
        icon={icon ?? <UploadOutlined />}
        intent={intent}
        loading={loading}
        size={size}
        onClick={() => inputRef.current?.click()}
      >
        {buttonLabel}
      </AppButton>
    </>
  );
};

export default UploadTriggerButton;
