
export const APP_ICON_COLORS: Record<string, string> = {
    'blue': 'text-blue-600 bg-blue-50',
    'purple': 'text-purple-600 bg-purple-50',
    'emerald': 'text-emerald-600 bg-emerald-50',
    'rose': 'text-rose-600 bg-rose-50',
    'orange': 'text-orange-600 bg-orange-50',
    'indigo': 'text-indigo-600 bg-indigo-50',
    // Fallback/Legacy support for full classes if seeded
    'bg-blue-100 text-blue-600': 'bg-blue-100 text-blue-600',
    'bg-green-100 text-green-600': 'bg-green-100 text-green-600',
    'bg-purple-100 text-purple-600': 'bg-purple-100 text-purple-600',
    'bg-orange-100 text-orange-600': 'bg-orange-100 text-orange-600'
};

export const getColorClass = (colorName: string): string => {
    if (!colorName) return APP_ICON_COLORS['blue'];
    return APP_ICON_COLORS[colorName] || colorName; // Fallback to returning input if not found (in case it IS a class string)
};
