
import {
    Users, CreditCard, LifeBuoy, FileText, Briefcase, Calendar,
    ShieldCheck, Mail, Globe, MessageSquare, PieChart, HardDrive,
    LayoutDashboard, Newspaper, Settings, Search, Monitor, Moon, Sun, Laptop,
    ArrowRight, ChevronRight, Share2, Edit3, Camera, Clock, Award, Phone, MapPin,
    Sparkles, SearchCode, Loader2, ExternalLink, Zap, X, CheckCircle2, CircleDashed,
    RotateCcw, LayoutGrid, AppWindow, Cloud, Server, Database, Terminal, Code,
    Slack, Github, Trello, Figma, Chrome, Youtube, Twitter, Linkedin, Facebook,
    Instagram, ShoppingCart, Truck, Package, Box, Archive, Printer,
    Book, BookOpen, GraduationCap, School,
    Ticket, Plane, Train, Car, Bus,
    Music, Video, Image, Mic, Speaker,
    Wifi, Bluetooth, Cpu,
    Home, User, LogOut, Menu
} from 'lucide-react';
import React from 'react';

// Registry of available icons
const ICON_REGISTRY: Record<string, React.ElementType> = {
    Users, CreditCard, LifeBuoy, FileText, Briefcase, Calendar,
    ShieldCheck, Mail, Globe, MessageSquare, PieChart, HardDrive,
    LayoutDashboard, Newspaper, Settings, Search, Monitor, Moon, Sun, Laptop,
    ArrowRight, ChevronRight, Share2, Edit3, Camera, Clock, Award, Phone, MapPin,
    Sparkles, SearchCode, Loader2, ExternalLink, Zap, X, CheckCircle2, CircleDashed,
    RotateCcw, LayoutGrid, AppWindow, Cloud, Server, Database, Terminal, Code,
    Slack, Github, Trello, Figma, Chrome, Youtube, Twitter, Linkedin, Facebook,
    Instagram, ShoppingCart, Truck, Package, Box, Archive, Printer,
    Book, BookOpen, GraduationCap, School,
    Ticket, Plane, Train, Car, Bus,
    Music, Video, Image, Mic, Speaker,
    Wifi, Bluetooth, Cpu,
    Home, User, LogOut, Menu
};

// Case-insensitive lookup map
const LOWERCASE_MAP: Record<string, string> = Object.keys(ICON_REGISTRY).reduce((acc, key) => {
    acc[key.toLowerCase()] = key;
    return acc;
}, {} as Record<string, string>);

export const getIcon = (name: string, props: any = {}) => {
    if (!name) return <AppWindow {...props} />;

    // 1. Direct match
    let IconComponent = ICON_REGISTRY[name];

    // 2. Case-insensitive match
    if (!IconComponent) {
        const correctCaseName = LOWERCASE_MAP[name.toLowerCase()];
        if (correctCaseName) {
            IconComponent = ICON_REGISTRY[correctCaseName];
        }
    }

    // 3. Fallback
    if (!IconComponent) {
        return <AppWindow {...props} />; // Better fallback than FileText for "Apps"
    }

    return <IconComponent {...props} />;
};
