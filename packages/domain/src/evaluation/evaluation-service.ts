import type { Evaluation, EvaluationMethod, EvaluationStatus, RequestEvaluationInput } from './evaluation.js';

/**
 * Evaluation Service Interface
 * 
 * Business operations for evaluation lifecycle.
 */
export interface EvaluationService {
    /** Request a new evaluation for a response */
    evaluate(input: RequestEvaluationInput): Promise<Evaluation>;

    /** Re-evaluate a response (creates new evaluation, preserves old) */
    reevaluate(responseId: string, method: EvaluationMethod): Promise<Evaluation>;

    /** Find all evaluations for a response */
    findByResponse(responseId: string): Promise<Evaluation[]>;

    /** Find the latest evaluation for a response */
    findLatest(responseId: string): Promise<Evaluation | null>;

    /** Find the latest evaluation by method */
    findLatestByMethod(responseId: string, method: EvaluationMethod): Promise<Evaluation | null>;
}

/**
 * Evaluation Repository Interface
 * 
 * Persistence operations for evaluation records.
 */
export interface EvaluationRepository {
    findById(id: string): Promise<Evaluation | null>;
    findByResponse(responseId: string): Promise<Evaluation[]>;
    findByStatus(status: EvaluationStatus): Promise<Evaluation[]>;
    create(input: RequestEvaluationInput): Promise<Evaluation>;
    updateStatus(id: string, status: EvaluationStatus, result?: Evaluation['result'], error?: string): Promise<Evaluation>;
}

/**
 * Evaluator Interface
 * 
 * Contract for evaluation implementations.
 * Different evaluators can be plugged in (auto-grader, AI model, human queue).
 */
export interface Evaluator<M extends EvaluationMethod = EvaluationMethod> {
    readonly method: M;
    evaluate(responseId: string): Promise<Evaluation<M>['result']>;
}
