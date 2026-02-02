import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Play,
    BookOpen,
    Headphones,
    PenTool,
    Mic,
    Clock,
    Calendar,
    ArrowRight
} from 'lucide-react';
import { MainLayout } from '../components/layout/MainLayout';
import { SkillCard } from '../features/dashboard/SkillCard';
import { MOCK_PRODUCT, MOCK_EXPERIENCE } from '../mocks/ielts';

export const Dashboard: React.FC = () => {
    const navigate = useNavigate();

    // Helper to map section types to icons and colors
    const getSectionStyle = (type: string) => {
        switch (type) {
            case 'listening': return { icon: Headphones, color: 'bg-purple-500', text: 'text-purple-600', bg: 'bg-purple-50' };
            case 'reading': return { icon: BookOpen, color: 'bg-blue-500', text: 'text-blue-600', bg: 'bg-blue-50' };
            case 'writing': return { icon: PenTool, color: 'bg-orange-500', text: 'text-orange-600', bg: 'bg-orange-50' };
            case 'speaking': return { icon: Mic, color: 'bg-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50' };
            default: return { icon: BookOpen, color: 'bg-gray-500', text: 'text-gray-600', bg: 'bg-gray-50' };
        }
    };

    return (
        <MainLayout>
            <div className="space-y-8 max-w-7xl mx-auto">

                {/* Header Section */}
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">{MOCK_PRODUCT.name}</h1>
                    <p className="text-gray-500 mt-1">{MOCK_PRODUCT.description}</p>
                </div>

                {/* Hero Card: Full Exam */}
                <section className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-emerald-50 to-transparent pointer-events-none"></div>

                    <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full uppercase tracking-wider">
                                    Recommended
                                </span>
                                <span className="text-gray-400 text-sm flex items-center gap-1">
                                    <Clock size={16} /> ~2h 45m
                                </span>
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">{MOCK_EXPERIENCE.title}</h2>
                            <p className="text-gray-600 max-w-xl">
                                {MOCK_EXPERIENCE.description}
                                <br />
                                Includes {MOCK_EXPERIENCE.sections.map(s => s.title).join(', ')}.
                            </p>
                        </div>

                        <button
                            onClick={() => navigate(`/test/${MOCK_EXPERIENCE.id}`)}
                            className="px-8 py-4 bg-gray-900 text-white font-bold rounded-xl hover:bg-black transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center gap-3 shrink-0"
                        >
                            <Play size={20} fill="currentColor" />
                            Start Full Mock Test
                        </button>
                    </div>
                </section>

                {/* Section Practice Grid */}
                <section>
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-gray-900">Practice by Section</h2>
                        <button className="text-sm text-gray-500 hover:text-gray-900 font-medium">View all</button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {MOCK_EXPERIENCE.sections.map(section => {
                            const style = getSectionStyle(section.type);
                            const Icon = style.icon;

                            return (
                                <div key={section.id} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group cursor-pointer relative overflow-hidden">
                                    <div className={`absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform duration-500`}>
                                        <Icon size={100} className={style.text} />
                                    </div>

                                    <div className="relative z-10">
                                        <div className={`w-12 h-12 rounded-xl ${style.bg} ${style.text} flex items-center justify-center mb-4`}>
                                            <Icon size={24} />
                                        </div>
                                        <h3 className="text-lg font-bold text-gray-900">{section.title}</h3>
                                        <p className="text-sm text-gray-500 mt-1">{section.parts.length} Part(s)</p>

                                        <div className="mt-6 pt-6 border-t border-gray-50 flex items-center justify-between">
                                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">0% Done</span>
                                            <button
                                                onClick={() => navigate(`/exam/${MOCK_EXPERIENCE.id}/${section.id}`)}
                                                className={`w-8 h-8 rounded-full ${style.bg} ${style.text} flex items-center justify-center hover:scale-110 transition-transform`}
                                            >
                                                <ArrowRight size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* Recent Activity (Mocked for now as we don't have backend history yet) */}
                <section>
                    <h2 className="text-xl font-bold text-gray-900 mb-6">Recent Activity</h2>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
                        {/* Placeholder Empty State or Mock Items */}
                        <div className="p-8 text-center text-gray-500">
                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Calendar size={24} className="text-gray-400" />
                            </div>
                            <p>No recent activity. Start a test to see your progress!</p>
                        </div>
                    </div>
                </section>
            </div>
        </MainLayout>
    );
};
