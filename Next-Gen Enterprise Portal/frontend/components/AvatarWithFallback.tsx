import React, { useEffect, useState } from 'react';

interface AvatarWithFallbackProps {
  src?: string;
  name: string;
  className?: string;
}

const DEFAULT_AVATAR_URL = '/images/default-avatar.svg';

const AvatarWithFallback: React.FC<AvatarWithFallbackProps> = ({ src, name, className }) => {
  const [imgSrc, setImgSrc] = useState(src);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setImgSrc(src);
    setHasError(false);
  }, [src]);

  if (!src || hasError) {
    return <img src={DEFAULT_AVATAR_URL} className={className} alt={name} />;
  }

  return (
    <img
      src={imgSrc}
      className={className}
      alt={name}
      onError={() => setHasError(true)}
    />
  );
};

export default AvatarWithFallback;
