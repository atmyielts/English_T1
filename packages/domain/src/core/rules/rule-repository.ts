import type { Rule, RuleCategory, CreateRuleInput } from './rule.js';
import type { RuleAttachment, AttachmentTarget, CreateRuleAttachmentInput } from './rule-attachment.js';

/**
 * Rule Repository Interface
 * 
 * Persistence operations for rules and attachments.
 */
export interface RuleRepository {
    // Rule operations
    findRuleById(id: string): Promise<Rule | null>;
    findRulesByCategory(category: RuleCategory): Promise<Rule[]>;
    createRule<C extends RuleCategory>(input: CreateRuleInput<C>): Promise<Rule<C>>;

    // Attachment operations
    findAttachmentById(id: string): Promise<RuleAttachment | null>;
    findAttachmentsByTarget(targetType: AttachmentTarget, targetId: string): Promise<RuleAttachment[]>;
    findAttachmentsByRule(ruleId: string): Promise<RuleAttachment[]>;
    createAttachment(input: CreateRuleAttachmentInput): Promise<RuleAttachment>;
    removeAttachment(id: string): Promise<void>;

    // Resolved rules (with inheritance)
    getEffectiveRules(targetType: AttachmentTarget, targetId: string): Promise<Rule[]>;
}
