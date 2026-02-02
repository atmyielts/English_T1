import type { Experience, Response, Session } from '../domain/models';

interface ScoreResult {
    rawScore: number;
    maxScore: number;
    band: number;
    sectionId: string;
}

interface EvaluationResult {
    sections: Record<string, ScoreResult>;
    overallBand: number;
    evaluatedAt: string;
}

// Minimal scoring config (could be fetched from DB later)
const BAND_THRESHOLDS: Record<string, [number, number][]> = {
    // raw score range -> band
    'listening': [[0, 0], [39, 9.0], [37, 8.5], [35, 8.0], [32, 7.5], [30, 7.0]],
    'reading': [[0, 0], [39, 9.0], [37, 8.5], [35, 8.0], [32, 7.5], [30, 7.0]],
    // writing/speaking need AI or manual - simpler placeholder for now
};

const calculateBand = (raw: number, type: string): number => {
    const thresholds = BAND_THRESHOLDS[type] || [];
    for (const [min, band] of thresholds) {
        if (raw >= min) return band;
    }
    return 0; // fallback
};

export const scoreSession = (
    experience: Experience,
    responses: Response[]
): EvaluationResult => {
    const sectionResults: Record<string, ScoreResult> = {};
    let totalBand = 0;
    let sectionCount = 0;

    experience.sections.forEach(section => {
        // Filter responses for this section
        // We need to know which units belong to this section
        const sectionUnitIds = new Set(
            section.parts.flatMap(p => p.contentUnits.map(u => u.id))
        );

        const sectionResponses = responses.filter(r => sectionUnitIds.has(r.contentUnitId));

        // Count correct answers (very simplified Mock logic)
        // In reality, we'd check against an AnswerKey map
        let correctCount = 0;
        let maxScore = 0;

        section.parts.forEach(part => {
            part.contentUnits.forEach(unit => {
                const response = sectionResponses.find(r => r.contentUnitId === unit.id);

                // Hacky scoring logic for MVP:
                // If it's a question, maxScore++
                // If response matches "correct" (we don't have answer keys in mock yet)
                // Let's just pretend random correctness for the audit visualization
                if (unit.type.startsWith('question_')) {
                    maxScore++;
                    // SIMULATION: If they answered anything, give points (just to prove flow works)
                    if (response && response.data) {
                        correctCount++;
                    }
                }
            });
        });

        const band = calculateBand(correctCount, section.type);

        sectionResults[section.id] = {
            rawScore: correctCount,
            maxScore,
            band,
            sectionId: section.id
        };

        if (maxScore > 0) {
            totalBand += band;
            sectionCount++;
        }
    });

    const overall = sectionCount > 0 ? Math.round((totalBand / sectionCount) * 2) / 2 : 0;

    return {
        sections: sectionResults,
        overallBand: overall,
        evaluatedAt: new Date().toISOString()
    };
};
