import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface SkillCardProps {
    icon: LucideIcon;
    title: string;
    progress: number;
    color: string; // e.g., "bg-blue-500" or hex
}

export const SkillCard: React.FC<SkillCardProps> = ({ icon: Icon, title, progress, color }) => {
    return (
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
            <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-lg ${color} bg-opacity-10 text-opacity-100`}>
                        {/* We use inline styles for dynamic color or just classes if passed strictly */}
                        {/* Hack for Tailwind arbitrary dynamic colors if passed as className, assuming 'text-blue-600' style format */}
                        <Icon className={`w-6 h-6 text-gray-700`} />
                    </div>
                    <span className="font-bold text-lg text-gray-800">{title}</span>
                </div>
                <span className="font-mono font-bold text-gray-400 text-sm">
                    {progress}%
                </span>
            </div>

            <div className="space-y-4">
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                        className={`h-full rounded-full ${color}`}
                        style={{ width: `${progress}%` }}
                    />
                </div>

                <button className="w-full py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300 transition-all">
                    Start Practice
                </button>
            </div>
        </div>
    );
};
