import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { finalizeSession, getResponses, persistEvaluation } from '../services/persistence';
import { scoreSession } from '../services/scoring';
import { MOCK_EXPERIENCE } from '../mocks/ielts';

export const TestCompleted: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    // Retrieve session from navigation state
    const sessionId = location.state?.sessionId;
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const runCompletionFlow = async () => {
            if (!sessionId) {
                console.warn('TestCompleted mounted without sessionId');
                setLoading(false);
                return;
            }

            try {
                // 1. Finalize Session
                await finalizeSession(sessionId);

                // 2. Fetch Responses
                const responses = await getResponses(sessionId);

                // 3. Score Session (Pure Logic)
                const evaluation = scoreSession(MOCK_EXPERIENCE, responses);
                setResult(evaluation);

                // 4. Persist Result
                await persistEvaluation(sessionId, evaluation);

            } catch (err) {
                console.error('Completion flow failed:', err);
            } finally {
                setLoading(false);
            }
        };

        runCompletionFlow();
    }, [sessionId]);

    if (loading) {
        return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">Processing Result...</div>;
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
            <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <span className="text-3xl">✅</span>
                </div>

                <h1 className="text-2xl font-bold text-gray-900 mb-2">Test Completed</h1>
                <p className="text-gray-600 mb-8">
                    Your session has been finalized and scored.
                </p>

                {result && (
                    <div className="bg-gray-50 p-4 rounded mb-6 text-left">
                        <div className="flex justify-between items-center mb-4 border-b pb-2">
                            <span className="font-bold text-gray-700">Overall Band</span>
                            <span className="font-bold text-2xl text-blue-600">{result.overallBand}</span>
                        </div>
                        <div className="space-y-2 text-sm">
                            {Object.entries(result.sections).map(([id, score]: [string, any]) => (
                                <div key={id} className="flex justify-between">
                                    <span className="capitalize">{id.replace('sec-', '')}</span>
                                    <span>{score.rawScore}/{score.maxScore} (Band {score.band})</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <button
                    onClick={() => navigate('/')}
                    className="w-full bg-blue-600 text-white py-3 rounded-md font-medium hover:bg-blue-700 transition-colors"
                >
                    Return to Dashboard
                </button>
            </div>
        </div>
    );
};
