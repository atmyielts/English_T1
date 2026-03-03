export type UUID = string;

// --- Domain Core (Structure) ---

export interface Product {
    id: UUID;
    name: string;
    description?: string;
}

export interface Experience {
    id: UUID;
    productId: UUID;
    title: string;
    description?: string;
    sections: Section[];
}

export interface Section {
    id: UUID;
    experienceId: UUID;
    title: string; // e.g., "Listening"
    type: 'listening' | 'reading' | 'writing' | 'speaking';
    order: number;
    parts: Part[];
}

export interface Part {
    id: UUID;
    sectionId: UUID;
    title: string; // e.g., "Part 1"
    order: number;
    contentUnits: ContentUnit[];
}

// --- Product Data (Content) ---

export type ContentUnitType =
    | 'instruction'
    | 'reading_passage'
    | 'audio'
    | 'image'
    | 'question_text'
    | 'question_single_choice'
    | 'question_multi_choice'
    | 'question_matching'
    | 'question_true_false_not_given'
    | 'question_yes_no_not_given'
    | 'question_matching_headings'
    | 'question_sentence_endings'
    | 'question_gap_fill'
    | 'question_select_from_list'
    | 'question_table_completion'
    | 'question_diagram_labeling'
    | 'question_drag_drop';

export interface ContentUnit {
    id: UUID;
    partId: UUID;
    type: ContentUnitType;
    data: ContentUnitData;
    displayOrder: number;
}

// Discriminated union for type safety
export type ContentUnitData =
    | { text: string } // instruction, reading_passage
    | { src: string; duration?: number } // audio
    | { prompt: string; placeholder?: string } // question_text
    | { prompt: string; options: { id: string; label: string }[] }; // question_choice

// --- Runtime (Interaction) ---

export type SessionStatus = 'created' | 'active' | 'paused' | 'completed' | 'abandoned' | 'expired';

export interface Session {
    id: UUID;
    userId: UUID;
    experienceId: UUID;
    status: SessionStatus;
    metadata?: Record<string, any>;
}

export interface Response {
    id: UUID;
    sessionId: UUID;
    contentUnitId: UUID;
    data: any; // The user's answer
    submittedAt: string; // ISO Date
}
