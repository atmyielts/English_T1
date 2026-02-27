import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard,
    BookOpen,
    FileText,
    BarChart2,
    RotateCcw,
    CreditCard,
    UserCircle2,
    Menu,
    X,
    Home
} from 'lucide-react';
import { buildPlatformUrl, getReturnTo, hasPlatformBase } from '../../lib/platformUrls';
import { IELTS_PRODUCT_SLUG } from '../../lib/constants';

interface MainLayoutProps {
    children: React.ReactNode;
}

type MainNavProps = {
    pathname: string;
    inactiveClass: string;
    activeClass: string;
    onNavigate?: () => void;
    goPlatformHome: () => void;
    goPlatform: (path: string) => void;
};

const isMainActivePath = (pathname: string, path: string) => {
    if (path === '/dashboard') return pathname === '/dashboard' || pathname.startsWith('/dashboard/');
    return pathname === path || pathname.startsWith(`${path}/`);
};

const MainNav: React.FC<MainNavProps> = ({ pathname, inactiveClass, activeClass, onNavigate, goPlatformHome, goPlatform }) => (
    <nav className="flex-1 py-6 space-y-1">
        <button
            type="button"
            onClick={() => {
                onNavigate?.();
                goPlatformHome();
            }}
            className={`mx-3 w-[calc(100%-1.5rem)] flex items-center px-3 py-2.5 rounded-2xl gap-3 text-sm font-medium ${inactiveClass}`}
        >
            <Home size={18} />
            Platform home
        </button>
        <Link
            to="/dashboard"
            onClick={onNavigate}
            className={`mx-3 flex items-center px-3 py-2.5 rounded-2xl gap-3 text-sm font-medium ${isMainActivePath(pathname, '/dashboard') ? activeClass : inactiveClass}`}
        >
            <LayoutDashboard size={18} />
            Dashboard
        </Link>
        <Link
            to="/practice"
            onClick={onNavigate}
            className={`mx-3 flex items-center px-3 py-2.5 rounded-2xl gap-3 text-sm font-medium ${isMainActivePath(pathname, '/practice') ? activeClass : inactiveClass}`}
        >
            <BookOpen size={18} />
            Practice
        </Link>
        <Link
            to="/full-exam"
            onClick={onNavigate}
            className={`mx-3 flex items-center px-3 py-2.5 rounded-2xl gap-3 text-sm font-medium ${isMainActivePath(pathname, '/full-exam') ? activeClass : inactiveClass}`}
        >
            <FileText size={18} />
            Full Exam
        </Link>
        <Link
            to="/stats"
            onClick={onNavigate}
            className={`mx-3 flex items-center px-3 py-2.5 rounded-2xl gap-3 text-sm font-medium ${isMainActivePath(pathname, '/stats') ? activeClass : inactiveClass}`}
        >
            <BarChart2 size={18} />
            Stats
        </Link>
        <Link
            to="/review"
            onClick={onNavigate}
            className={`mx-3 flex items-center px-3 py-2.5 rounded-2xl gap-3 text-sm font-medium ${isMainActivePath(pathname, '/review') ? activeClass : inactiveClass}`}
        >
            <RotateCcw size={18} />
            Review
        </Link>
        <button
            type="button"
            onClick={() => {
                onNavigate?.();
                goPlatform('/pricing');
            }}
            className={`mx-3 flex items-center px-3 py-2.5 rounded-2xl gap-3 text-sm font-medium ${inactiveClass}`}
        >
            <CreditCard size={18} />
            Pricing
        </button>
    </nav>
);

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    const activeClass = 'bg-white/10 text-white border border-white/10';
    const inactiveClass = 'text-zinc-400 hover:text-white hover:bg-white/5 transition-colors';

    const title = useMemo(() => {
        const p = location.pathname;
        if (p === '/dashboard') return 'Dashboard';
        if (p.startsWith('/practice')) return 'Practice';
        if (p.startsWith('/full-exam') || p.startsWith('/test')) return 'Full Exam';
        if (p.startsWith('/stats')) return 'Stats';
        if (p.startsWith('/review')) return 'Review';
        if (p.startsWith('/account')) return 'Account';
        return 'Dashboard';
    }, [location.pathname]);

    const returnTo = getReturnTo(location);

    const goPlatform = (path: string) => {
        const url = buildPlatformUrl(path, returnTo, { product: IELTS_PRODUCT_SLUG });
        if (hasPlatformBase) {
            window.location.assign(url);
            return;
        }
        navigate(url);
    };

    const goPlatformHome = () => {
        if (hasPlatformBase) {
            const url = buildPlatformUrl('/', returnTo, { product: IELTS_PRODUCT_SLUG });
            window.location.assign(url);
            return;
        }
        navigate('/platform-home');
    };

    useEffect(() => {
        // Close drawer only when route changes.
        setMobileNavOpen(false);
    }, [location.pathname]);

    return (
        <div className="flex min-h-[100dvh] md:h-screen bg-gradient-to-br from-gray-50 via-white to-emerald-50 font-sans overflow-hidden">
            {/* Desktop Sidebar */}
            <aside className="hidden md:flex w-64 bg-zinc-950/95 backdrop-blur flex-col shrink-0 z-20 border-r border-white/5">
                <div className="h-16 flex items-center px-6 border-b border-white/5">
                    <button
                        type="button"
                        onClick={() => navigate('/')}
                        className="text-white font-bold text-lg tracking-wide flex items-center gap-2 hover:text-emerald-300"
                    >
                        <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
                        IELTS Simulator
                    </button>
                </div>

                <MainNav
                    pathname={location.pathname}
                    inactiveClass={inactiveClass}
                    activeClass={activeClass}
                    goPlatformHome={goPlatformHome}
                    goPlatform={goPlatform}
                />

                <div className="p-4 border-t border-white/5">
                    <div className="border border-white/10 bg-white/5 rounded-2xl p-4 text-center">
                        <span className="text-zinc-300 text-xs font-bold uppercase tracking-wider block mb-1">Subscription</span>
                        <span className="text-white font-bold block mb-3">Manage plans</span>
                            <button
                                type="button"
                                onClick={() => goPlatform('/pricing')}
                                className="block w-full text-center text-xs bg-white/10 border border-white/10 text-white py-2 rounded-xl hover:bg-white/15 transition-colors"
                            >
                                View pricing
                            </button>
                            <button
                                type="button"
                                onClick={goPlatformHome}
                                className="mt-2 block w-full text-center text-xs bg-white/10 border border-white/10 text-white py-2 rounded-xl hover:bg-white/15 transition-colors"
                            >
                                Back to platform
                            </button>
                            <button
                                type="button"
                                onClick={() => goPlatform('/contact')}
                                className="mt-2 block w-full text-center text-xs bg-white/10 border border-white/10 text-white py-2 rounded-xl hover:bg-white/15 transition-colors"
                            >
                                Contact support
                            </button>
                        </div>
                    </div>
                </aside>

            {/* Mobile Drawer */}
            {mobileNavOpen ? (
                <div className="md:hidden fixed inset-0 z-40">
                    <div
                        className="absolute inset-0 bg-black/40"
                        onClick={() => setMobileNavOpen(false)}
                    />
                    <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-zinc-950/95 backdrop-blur flex flex-col border-r border-white/5">
                    <div className="h-16 flex items-center justify-between px-5 border-b border-white/5">
                        <button
                            type="button"
                            onClick={() => {
                                setMobileNavOpen(false);
                                navigate('/');
                            }}
                            className="text-white font-bold text-lg tracking-wide flex items-center gap-2 hover:text-emerald-300"
                        >
                            <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
                            IELTS Simulator
                        </button>
                        <button
                                type="button"
                                className="h-10 w-10 inline-flex items-center justify-center rounded-xl text-white/80 hover:text-white hover:bg-white/10"
                                onClick={() => setMobileNavOpen(false)}
                                aria-label="Close menu"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <MainNav
                            pathname={location.pathname}
                            inactiveClass={inactiveClass}
                            activeClass={activeClass}
                            goPlatformHome={goPlatformHome}
                            goPlatform={goPlatform}
                            onNavigate={() => setMobileNavOpen(false)}
                        />

                        <div className="p-4 border-t border-white/5">
                            <div className="border border-white/10 bg-white/5 rounded-2xl p-4 text-center">
                                <span className="text-zinc-300 text-xs font-bold uppercase tracking-wider block mb-1">Subscription</span>
                                <span className="text-white font-bold block mb-3">Manage plans</span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMobileNavOpen(false);
                                        goPlatform('/pricing');
                                    }}
                                    className="block w-full text-center text-xs bg-white/10 border border-white/10 text-white py-2 rounded-xl hover:bg-white/15 transition-colors"
                                >
                                    View pricing
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMobileNavOpen(false);
                                        goPlatformHome();
                                    }}
                                    className="mt-2 block w-full text-center text-xs bg-white/10 border border-white/10 text-white py-2 rounded-xl hover:bg-white/15 transition-colors"
                                >
                                    Back to platform
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMobileNavOpen(false);
                                        goPlatform('/contact');
                                    }}
                                    className="mt-2 block w-full text-center text-xs bg-white/10 border border-white/10 text-white py-2 rounded-xl hover:bg-white/15 transition-colors"
                                >
                                    Contact support
                                </button>
                            </div>
                        </div>
                    </aside>
                </div>
            ) : null}

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header */}
                <header className="h-16 bg-white/70 backdrop-blur border-b border-white/60 flex items-center justify-between px-4 sm:px-6 lg:px-8 shadow-sm z-10">
                    <div className="flex items-center gap-3 min-w-0">
                        <button
                            type="button"
                            className="md:hidden h-10 w-10 inline-flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-700"
                            onClick={() => setMobileNavOpen(true)}
                            aria-label="Open menu"
                        >
                            <Menu size={20} />
                        </button>
                        <h1 className="text-xl font-bold text-gray-800 truncate">{title}</h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors"
                            type="button"
                            onClick={() => goPlatform('/account')}
                        >
                            <UserCircle2 size={20} />
                        </button>
                    </div>
                </header>

                {/* Content Scroll Area */}
                <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 relative">
                    {children}
                </main>
            </div>
        </div>
    );
};
