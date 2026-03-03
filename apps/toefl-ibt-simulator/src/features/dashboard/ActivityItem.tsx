import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface ActivityItemProps {
    icon: LucideIcon;
    title: string;
    time: string;
    score?: number;
    color: string;
}

export const ActivityItem: React.FC<ActivityItemProps> = ({ icon: Icon, title, time, score, color }) => {
    return (
        <div className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-lg hover:border-gray-200 transition-colors">
            <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg ${color} bg-opacity-10 flex items-center justify-center text-gray-700`}>
                    <Icon size={20} />
                </div>
                <div>
                    <h4 className="font-bold text-gray-800 text-sm">{title}</h4>
                    <p className="text-xs text-gray-500 mt-0.5">{time}</p>
                </div>
            </div>

            {score !== undefined && (
                <div className="px-3 py-1 bg-gray-50 rounded text-sm font-bold text-gray-700 border border-gray-200">
                    {score.toFixed(1)}
                </div>
            )}
        </div>
    );
};
