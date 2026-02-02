import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    Clock,
    CheckCircle2,
    BookOpen,
    Headphones,
    PenTool,
    Mic,
    AlertCircle,
    ArrowRight,
    ArrowLeft
} from 'lucide-react';
import { MainLayout } from '../components/layout/MainLayout';
import { MOCK_EXPERIENCE } from '../mocks/ielts';
import { createSession } from '../services/persistence';

export const TestOverview: React.FC = () => {
    const navigate = useNavigate();
    const { testId } = useParams();
    const exp = MOCK_EXPERIENCE; // In real app, fetch by testId

    const getIcon = (type: string) => {
        switch (type) {
            case 'listening': return Headphones;
            case 'reading': return BookOpen;
            case 'writing': return PenTool;
            case 'speaking': return Mic;
            default: return BookOpen;
        }
    };

    return (
        <MainLayout>
            <div className="max-w-4xl mx-auto">
                <button
                    onClick={() => navigate('/')}
                    className="flex items-center text-gray-400 hover:text-gray-900 mb-6 transition-colors"
                >
                    <ArrowLeft size={18} className="mr-2" /> Back to Dashboard
                </button>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    {/* Header Banner */}
                    <div className="bg-gray-900 p-8 text-white relative overflow-hidden">
                        <div className="absolute right-0 top-0 w-64 h-64 bg-emerald-500 rounded-full blur-3xl opacity-10 -mr-16 -mt-16"></div>

                        <div className="relative z-10">
                            <h1 className="text-3xl font-bold font-display mb-2">{exp.title}</h1>
                            <p className="text-gray-300 max-w-xl text-lg">{exp.description}</p>

                            <div className="flex items-center gap-6 mt-6">
                                <div className="flex items-center gap-2">
                                    <Clock size={20} className="text-emerald-400" />
                                    <span className="font-medium">2h 45m Duration</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 size={20} className="text-emerald-400" />
                                    <span className="font-medium">Official Format</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-8">
                        <div className="flex items-center gap-2 mb-6 text-gray-900 font-bold text-lg">
                            <AlertCircle size={20} className="text-blue-500" />
                            Test Components
                        </div>

                        <div className="space-y-4">
                            {exp.sections.map((section, index) => {
                                const Icon = getIcon(section.type);
                                return (
                                    <div key={section.id} className="flex items-center p-4 rounded-xl border border-gray-100 bg-gray-50 hover:bg-white hover:border-gray-200 hover:shadow-sm transition-all">
                                        <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-700 shadow-sm shrink-0">
                                            <span className="font-bold font-mono">{index + 1}</span>
                                        </div>

                                        <div className="ml-4 flex-1">
                                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                                <Icon size={18} className="text-gray-500" />
                                                {section.title}
                                            </h3>
                                            <p className="text-sm text-gray-500">{section.parts.length} Parts • {section.parts.reduce((acc, p) => acc + p.contentUnits.length, 0)} Items</p>
                                        </div>

                                        <div className="px-4 py-1.5 bg-white border border-gray-200 rounded text-xs font-bold text-gray-600 uppercase tracking-wider">
                                            {section.type}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-10 flex justify-end pt-6 border-t border-gray-100">
                            <button
                                onClick={async () => {
                                    // 1. Create Session
                                    // In real app, userId comes from auth context. 
                                    // Here we simulate a user.
                                    const mockUserId = 'user-123-mock';
                                    const sessionId = await createSession(mockUserId, exp.id); // Imported below, need to fix imports if not auto

                                    if (sessionId) {
                                        // 2. Navigate with Session ID
                                        navigate(`/exam/${exp.id}/${exp.sections[0].id}`, {
                                            state: { sessionId }
                                        });
                                    } else {
                                        alert('Failed to start session. Check console.');
                                    }
                                }}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-bold py-4 px-10 rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center gap-2"
                            >
                                Start Examination <ArrowRight size={20} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};
