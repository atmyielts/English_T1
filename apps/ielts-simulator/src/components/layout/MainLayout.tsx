import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    BookOpen,
    FileText,
    BarChart2,
    RotateCcw,
    Settings,
    User,
    LogOut
} from 'lucide-react';

interface MainLayoutProps {
    children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
    const location = useLocation();

    const isActive = (path: string) => {
        return location.pathname === path ? 'bg-emerald-500/10 text-emerald-400 border-r-2 border-emerald-400' : 'text-gray-400 hover:text-white hover:bg-gray-800 transition-colors';
    };

    return (
        <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">
            {/* Sidebar */}
            <aside className="w-64 bg-black flex flex-col shrink-0 z-20">
                <div className="h-16 flex items-center px-6 border-b border-gray-800">
                    <span className="text-white font-bold text-lg tracking-wide flex items-center gap-2">
                        <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
                        IELTS Simulator
                    </span>
                </div>

                <nav className="flex-1 py-6 space-y-1">
                    <Link to="/" className={`flex items-center px-6 py-3 gap-3 text-sm font-medium ${isActive('/')}`}>
                        <LayoutDashboard size={18} />
                        Dashboard
                    </Link>
                    <Link to="/practice" className={`flex items-center px-6 py-3 gap-3 text-sm font-medium ${isActive('/practice')}`}>
                        <BookOpen size={18} />
                        Practice
                    </Link>
                    <Link to="/full-exam" className={`flex items-center px-6 py-3 gap-3 text-sm font-medium ${isActive('/full-exam')}`}>
                        <FileText size={18} />
                        Full Exam
                    </Link>
                    <Link to="/stats" className={`flex items-center px-6 py-3 gap-3 text-sm font-medium ${isActive('/stats')}`}>
                        <BarChart2 size={18} />
                        Stats
                    </Link>
                    <Link to="/review" className={`flex items-center px-6 py-3 gap-3 text-sm font-medium ${isActive('/review')}`}>
                        <RotateCcw size={18} />
                        Review
                    </Link>
                </nav>

                <div className="p-4 border-t border-gray-800">
                    <div className="border border-emerald-500/30 bg-emerald-500/10 rounded-lg p-4 text-center">
                        <span className="text-emerald-400 text-xs font-bold uppercase tracking-wider block mb-1">Current Plan</span>
                        <span className="text-white font-bold block mb-3">Premium Plan</span>
                        <button className="w-full text-xs bg-black border border-gray-600 text-white py-2 rounded hover:bg-gray-800 transition-colors">
                            Manage Subscription
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header */}
                <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-8 shadow-sm z-10">
                    <h1 className="text-xl font-bold text-gray-800">
                        {/* Dynamic Title based on route could go here */}
                        Dashboard
                    </h1>
                    <div className="flex items-center gap-4">
                        <button className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors">
                            <Settings size={20} />
                        </button>
                        <button className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors">
                            <User size={20} />
                        </button>
                    </div>
                </header>

                {/* Content Scroll Area */}
                <main className="flex-1 overflow-y-auto p-8 relative">
                    {children}
                </main>
            </div>
        </div>
    );
};
