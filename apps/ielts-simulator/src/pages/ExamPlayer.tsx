import React, { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { MOCK_EXPERIENCE } from '../mocks/ielts';
import { InputRenderer } from '../features/exam/InputRenderer';
import { insertResponse } from '../services/persistence';

export const ExamPlayer: React.FC = () => {
    const { sectionId } = useParams<{ sectionId: string }>();
    const navigate = useNavigate();
    const location = useLocation();

    // Retrieve session from navigation state (created in TestOverview)
    const sessionId = location.state?.sessionId;

    if (!sessionId) {
        // Fallback for direct URL access or refresh (in real app, restore from API)
        // console.warn('No session ID found in state. Responses will NOT be saved.');
    }

    // Local state for answers (Map<ContentUnitId, Value>)
    // draftResponses = current section's answers being typed
    const [draftResponses, setDraftResponses] = useState<Record<string, any>>({});

    // committedResponses = finalized answers (ready for DB)

    // Find current section
    const sectionIndex = MOCK_EXPERIENCE.sections.findIndex((s: any) => s.id === sectionId);
    const section = MOCK_EXPERIENCE.sections[sectionIndex];

    const isLastSection = sectionIndex === MOCK_EXPERIENCE.sections.length - 1;

    if (!section) return <div>Section not found</div>;

    const commitAnswers = async () => {
        // ACT OF TRUTH: Write to DB
        console.log('Committing answers for section:', section.title);

        // Parallel inserts (OK for this scale)
        const promises = Object.entries(draftResponses).map(([unitId, value]) => {
            console.log(`[COMMIT] Response for ${unitId}:`, value);
            if (sessionId) {
                // Determine type (mock data logic)
                const unit = section.parts.flatMap((p: any) => p.contentUnits).find((u: any) => u.id === unitId);
                const type = unit?.type || 'unknown';

                return insertResponse(sessionId, unitId, type, value);
            }
            return Promise.resolve();
        });

        await Promise.all(promises);
    };

    const handleNext = async () => {
        await commitAnswers(); // ACT OF TRUTH

        if (isLastSection) {
            navigate('/test-completed'); // Finish
        } else {
            const nextSection = MOCK_EXPERIENCE.sections[sectionIndex + 1];
            // Clear drafts for next section
            setDraftResponses({});
            navigate(`/exam/${MOCK_EXPERIENCE.id}/${nextSection.id}`, {
                state: { sessionId } // Pass session ID forward!
            });
        }
    };

    const handleInputChange = (unitId: string, value: any) => {
        setDraftResponses(prev => ({
            ...prev,
            [unitId]: value
        }));
    };

    return (
        <div className="h-screen flex flex-col bg-white overflow-hidden">
            {/* Top Bar */}
            <div className="h-16 bg-gray-900 text-white flex items-center justify-between px-6 shadow-md z-10 shrink-0">
                <div className="flex items-center space-x-4">
                    <h1 className="font-bold text-lg">{MOCK_EXPERIENCE.title}</h1>
                    <span className="text-gray-500">|</span>
                    <span className="text-gray-300 font-medium">{section.title}</span>
                </div>
                <div className="font-mono text-xl font-bold text-yellow-500">
                    40:00 <span className="text-xs text-gray-400 font-sans font-normal ml-1">left</span>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden flex relative">
                <main className="flex-1 overflow-y-auto p-8 max-w-6xl mx-auto w-full">
                    {section.parts.map((part: any) => (
                        <div key={part.id} className="mb-12">
                            <h2 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-2">{part.title}</h2>
                            <div className="space-y-8">
                                {part.contentUnits.map((unit: any) => (
                                    <InputRenderer
                                        key={unit.id}
                                        unit={unit}
                                        value={draftResponses[unit.id]}
                                        onChange={(val) => handleInputChange(unit.id, val)}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </main>
            </div>

            {/* Footer Navigation */}
            <div className="h-20 border-t border-gray-200 bg-gray-50 flex items-center justify-between px-8 shrink-0">
                <div className="text-gray-500 text-sm">
                    {/* Breadcrumbs or Status */}
                    Section {section.order} of {MOCK_EXPERIENCE.sections.length}
                </div>
                <button
                    onClick={handleNext}
                    className="bg-gray-900 text-white px-8 py-3 rounded font-bold hover:bg-black transition-colors flex items-center"
                >
                    {isLastSection ? 'Finish Test' : 'Next Section'}
                    <span className="ml-2">→</span>
                </button>
            </div>
        </div>
    );
};
