import React from 'react';

interface StatCardProps {
    label: string;
    value: string | number;
    subtext?: string;
    icon?: React.ReactNode;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, subtext, icon }) => {
    return (
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden">

            {icon && (
                <div className="absolute top-4 right-4 text-gray-300">
                    {icon}
                </div>
            )}

            <div>
                <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
                <h3 className="text-3xl font-extrabold text-gray-900 mt-2">{value}</h3>
            </div>

            {subtext && (
                <p className="text-xs font-medium text-emerald-600 mt-2 flex items-center gap-1">
                    {subtext}
                </p>
            )}
        </div>
    );
};
