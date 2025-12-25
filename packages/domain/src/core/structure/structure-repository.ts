import type {
    Experience, Section, Part,
    CreateExperienceInput, CreateSectionInput, CreatePartInput
} from './containers.js';

/**
 * Structure Repository Interface
 * 
 * Persistence operations for structural containers.
 */
export interface StructureRepository {
    // Experience operations
    findExperienceById(id: string): Promise<Experience | null>;
    findExperiencesByProduct(productId: string): Promise<Experience[]>;
    createExperience(input: CreateExperienceInput): Promise<Experience>;

    // Section operations
    findSectionById(id: string): Promise<Section | null>;
    findSectionsByExperience(experienceId: string): Promise<Section[]>;
    createSection(input: CreateSectionInput): Promise<Section>;

    // Part operations
    findPartById(id: string): Promise<Part | null>;
    findPartsBySection(sectionId: string): Promise<Part[]>;
    createPart(input: CreatePartInput): Promise<Part>;

    // Bulk loading for performance
    loadFullExperience(experienceId: string): Promise<{
        experience: Experience;
        sections: Section[];
        parts: Part[];
    } | null>;
}
