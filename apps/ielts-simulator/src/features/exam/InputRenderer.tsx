import React from 'react';
import type { ContentUnit } from '../../domain/models';

interface InputRendererProps {
    unit: ContentUnit;
    value?: any;
    onChange?: (value: any) => void;
}

export const InputRenderer: React.FC<InputRendererProps> = ({ unit, value, onChange }) => {
    // Helper to cast data safely-ish
    const data = unit.data as any;

    switch (unit.type) {
        case 'instruction':
            return (
                <div className="p-4 bg-gray-50 border-l-4 border-blue-500 rounded my-4">
                    <p className="text-gray-800 font-medium">{data.text}</p>
                </div>
            );

        case 'reading_passage':
            return (
                <div className="p-6 bg-white border border-gray-200 rounded shadow-sm text-justify leading-relaxed max-h-[60vh] overflow-y-auto font-serif text-lg">
                    {data.text}
                </div>
            );

        case 'audio':
            return (
                <div className="p-4 border rounded bg-blue-50 flex items-center space-x-4">
                    <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white">
                        ▶
                    </div>
                    <div>
                        <p className="font-bold text-gray-700">Audio Track</p>
                        <p className="text-sm text-gray-500">{data.duration} seconds</p>
                    </div>
                </div>
            );

        case 'question_text':
            return (
                <div className="my-4">
                    <p className="mb-2 font-medium text-gray-800">{data.prompt}</p>
                    <textarea
                        className="w-full p-4 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        placeholder={data.placeholder}
                        rows={6}
                        value={value || ''}
                        onChange={(e) => onChange?.(e.target.value)}
                    />
                </div>
            );

        case 'question_single_choice':
            return (
                <div className="my-4 space-y-3">
                    <p className="font-bold text-gray-800">{data.prompt}</p>
                    <div className="space-y-2">
                        {data.options?.map((opt: any) => (
                            <label key={opt.id} className={`flex items-center p-3 border rounded cursor-pointer transition-colors ${value === opt.id ? 'bg-blue-50 border-blue-500' : 'border-gray-200 hover:bg-gray-50'}`}>
                                <input
                                    type="radio"
                                    name={unit.id}
                                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                                    checked={value === opt.id}
                                    onChange={() => onChange?.(opt.id)}
                                />
                                <span className="ml-3 text-gray-700">{opt.label}</span>
                            </label>
                        ))}
                    </div>
                </div>
            );

        default:
            return <div className="text-red-500 p-2 border border-red-200 bg-red-50">Unknown unit type: {unit.type}</div>;
    }
};
