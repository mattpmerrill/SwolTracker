/**
 * Reusable avatar display component
 * Supports both emoji avatars and uploaded image URLs
 */

const AvatarDisplay = ({
  user,
  size = 'md',
  className = '',
  showBorder = false
}) => {
  const sizeClasses = {
    xs: 'w-6 h-6 text-sm',
    sm: 'w-8 h-8 text-lg',
    md: 'w-11 h-11 text-xl',
    lg: 'w-16 h-16 text-3xl',
    xl: 'w-20 h-20 text-4xl',
    '2xl': 'w-24 h-24 text-5xl'
  };

  const borderClasses = showBorder
    ? 'ring-2 ring-orange-500/50'
    : '';

  // Prefer avatar_url (image) if it exists, otherwise use emoji avatar
  if (user?.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={user.display_name || user.name || 'User'}
        className={`${sizeClasses[size]} rounded-2xl object-cover ${borderClasses} ${className}`}
      />
    );
  }

  // Emoji avatar fallback
  return (
    <div
      className={`${sizeClasses[size]} rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/20 ${borderClasses} ${className}`}
    >
      {user?.avatar || '💪'}
    </div>
  );
};

export default AvatarDisplay;
