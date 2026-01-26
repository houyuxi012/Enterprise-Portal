import {
    Users, CreditCard, LifeBuoy, FileText, Briefcase, Calendar,
    ShieldCheck, Mail, Globe, MessageSquare, PieChart, HardDrive,
    LayoutDashboard, Newspaper, Settings, Search, Monitor, Moon, Sun, Laptop,
    ArrowRight, ChevronRight, Share2, Edit3, Camera, Clock, Award, Phone, MapPin,
    Sparkles, SearchCode, Loader2, ExternalLink, Zap, X, CheckCircle2, CircleDashed,
    RotateCcw, LayoutGrid
} from 'lucide-react';
import React from 'react';

const ICON_MAP: Record<string, React.ElementType> = {
    Users, CreditCard, LifeBuoy, FileText, Briefcase, Calendar,
    ShieldCheck, Mail, Globe, MessageSquare, PieChart, HardDrive,
    LayoutDashboard, Newspaper, Settings, Search, Monitor, Moon, Sun, Laptop,
    ArrowRight, ChevronRight, Share2, Edit3, Camera, Clock, Award, Phone, MapPin,
    Sparkles, SearchCode, Loader2, ExternalLink, Zap, X, CheckCircle2, CircleDashed,
    RotateCcw, LayoutGrid
};

export const getIcon = (name: string, props: any = {}) => {
    const IconComponent = ICON_MAP[name];
    if (!IconComponent) {
        return <FileText {...props} />; // Default fallback
    }
    return <IconComponent {...props} />;
};
