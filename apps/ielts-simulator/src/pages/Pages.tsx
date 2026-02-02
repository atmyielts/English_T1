import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MOCK_EXPERIENCE, MOCK_PRODUCT } from '../mocks/ielts';
import { MOCK_PRODUCT as PRODUCT } from '../mocks/ielts'; // Re-export check
import { Link } from 'react-router-dom';

// --- Components ---

export const Dashboard: React.FC = () => {
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10">
            <div className="w-full max-w-4xl px-6">
                <header className="mb-10 text-center">
                    <h1 className="text-4xl font-bold text-gray-900 mb-2">{MOCK_PRODUCT.name}</h1>
                    <p className="text-xl text-gray-600">{MOCK_PRODUCT.description}</p>
                </header>

                <div className="grid gap-6">
                    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-center">
                            <div>
                                <h2 className="text-2xl font-bold text-gray-800">{MOCK_EXPERIENCE.title}</h2>
                                <p className="text-gray-600 mt-1">{MOCK_EXPERIENCE.description}</p>
                                <div className="flex gap-2 mt-4 text-sm text-gray-500">
                                    <span className="bg-gray-100 px-3 py-1 rounded">Listening</span>
                                    <span className="bg-gray-100 px-3 py-1 rounded">Reading</span>
                                    <span className="bg-gray-100 px-3 py-1 rounded">Writing</span>
                                </div>
                            </div>
                            <Link
                                to={`/test/${MOCK_EXPERIENCE.id}`}
                                className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                            >
                                Start Test
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const TestOverview: React.FC = () => {
    const exp = MOCK_EXPERIENCE;
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-2xl bg-white border border-gray-200 rounded-xl shadow-lg p-10">
                <h1 className="text-3xl font-bold text-gray-900 mb-6">{exp.title}</h1>

                <div className="space-y-6 mb-8">
                    <h3 className="text-lg font-semibold text-gray-700 uppercase tracking-wide">Test Components</h3>
                    <div className="space-y-4">
                        {exp.sections.map((sec) => (
                            <div key={sec.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100">
                                <div className="flex items-center gap-3">
                                    <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                                        {sec.order}
                                    </span>
                                    <span className="text-xl font-medium text-gray-800">{sec.title}</span>
                                </div>
                                <span className="text-gray-500">{sec.parts.length} Part(s)</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="border-t border-gray-100 pt-8 flex justify-end">
                    <button
                        onClick={() => navigate(`/exam/${exp.id}/${exp.sections[0].id}`)}
                        className="bg-green-600 text-white px-8 py-4 rounded-lg text-lg font-bold hover:bg-green-700 shadow-md transition-all transform hover:scale-105"
                    >
                        Confirm & Start
                    </button>
                </div>
            </div>
        </div>
    );
};
