/**
 * @foundation/domain
 * 
 * Universal, product-agnostic domain layer.
 * 
 * This package defines entities and interfaces that work for any
 * exam/practice/learning product: IELTS, TOEFL, SAT, coding interviews, etc.
 * 
 * ARCHITECTURAL INVARIANTS:
 * 1. Zero external dependencies (pure TypeScript)
 * 2. No imports from infrastructure, config, or UI
 * 3. All entities are immutable (readonly properties)
 * 4. Interfaces define contracts, implementations live elsewhere
 * 
 * LAYERS:
 * - core/       : Identity, Products, Entitlements, Content, Structure, Rules
 * - interaction/: Sessions, Responses
 * - evaluation/ : Evaluations, Evaluators
 * - assessment/ : Progress tracking
 */

// Core exports
export * from './core/index.js';

// Interaction exports
export * from './interaction/index.js';

// Evaluation exports
export * from './evaluation/index.js';

// Assessment exports
export * from './assessment/index.js';
