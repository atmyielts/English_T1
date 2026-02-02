import type { Experience, Product, Section } from '../domain/models';

export const MOCK_PRODUCT: Product = {
    id: 'prod-ielts-ac',
    name: 'IELTS Academic Simulator',
    description: 'Full computer-delivered IELTS Academic exam simulation.'
};

export const MOCK_EXPERIENCE: Experience = {
    id: 'exp-full-test-1',
    productId: 'prod-ielts-ac',
    title: 'IELTS Academic Practice Test 1',
    description: 'A full-length practice test covering Listening, Reading, and Writing.',
    sections: [] // Populated below
};

// --- Content Units ---

const listeningAudio = {
    id: 'unit-l-audio-1',
    partId: 'part-l-1',
    type: 'audio',
    data: { src: '/mock-audio.mp3', duration: 300 },
    displayOrder: 1
} as const;

const listeningQuestion1 = {
    id: 'unit-l-q-1',
    partId: 'part-l-1',
    type: 'question_single_choice',
    data: {
        prompt: 'What remains the main subject of the lecture?',
        options: [
            { id: 'opt-a', label: 'History of architecture' },
            { id: 'opt-b', label: 'Modern urban planning' },
            { id: 'opt-c', label: 'Ancient civil engineering' }
        ]
    },
    displayOrder: 2
} as const;

// --- Sections ---

const listeningSection: Section = {
    id: 'sec-listening',
    experienceId: 'exp-full-test-1',
    title: 'Listening',
    type: 'listening',
    order: 1,
    parts: [
        {
            id: 'part-l-1',
            sectionId: 'sec-listening',
            title: 'Part 1',
            order: 1,
            contentUnits: [listeningAudio as any, listeningQuestion1 as any]
        }
    ]
};

const readingSection: Section = {
    id: 'sec-reading',
    experienceId: 'exp-full-test-1',
    title: 'Reading',
    type: 'reading',
    order: 2,
    parts: [
        {
            id: 'part-r-1',
            sectionId: 'sec-reading',
            title: 'Passage 1',
            order: 1,
            contentUnits: [
                {
                    id: 'unit-r-txt-1',
                    partId: 'part-r-1',
                    type: 'reading_passage',
                    data: { text: 'The history of the steam engine...' },
                    displayOrder: 1
                },
                {
                    id: 'unit-r-q-1',
                    partId: 'part-r-1',
                    type: 'question_text',
                    data: { prompt: 'Who invented the first steam engine?', placeholder: 'Type your answer...' },
                    displayOrder: 2
                }
            ]
        }
    ]
};

const writingSection: Section = {
    id: 'sec-writing',
    experienceId: 'exp-full-test-1',
    title: 'Writing',
    type: 'writing',
    order: 3,
    parts: [
        {
            id: 'part-w-1',
            sectionId: 'sec-writing',
            title: 'Task 1',
            order: 1,
            contentUnits: [
                {
                    id: 'unit-w-inst-1',
                    partId: 'part-w-1',
                    type: 'instruction',
                    data: { text: 'Summarize the information in the chart below by selecting and reporting the main features.' },
                    displayOrder: 1
                },
                {
                    id: 'unit-w-q-1',
                    partId: 'part-w-1',
                    type: 'question_text',
                    data: { prompt: 'Write at least 150 words.', placeholder: 'Start typing here...' },
                    displayOrder: 2
                }
            ]
        }
    ]
};

MOCK_EXPERIENCE.sections = [listeningSection, readingSection, writingSection];
