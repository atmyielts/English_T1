/**
 * Rule Attachment
 * 
 * Associates rules with structural targets (products, experiences, etc.)
 * Rules can be attached at different levels for inheritance/override patterns.
 */

/** Valid targets for rule attachment */
export type AttachmentTarget = 'product' | 'experience' | 'section' | 'part';

/**
 * RuleAttachment - links a rule to a target.
 * 
 * @example
 * ```typescript
 * // Attach timing rule to IELTS Listening section
 * const attachment: RuleAttachment = {
 *   id: 'attach_1',
 *   ruleId: 'rule_ielts_listening_time',
 *   targetType: 'section',
 *   targetId: 'sec_listening',
 *   priority: 0,
 * };
 * ```
 */
export interface RuleAttachment {
    /** Unique attachment identifier */
    readonly id: string;

    /** Rule being attached */
    readonly ruleId: string;

    /** Type of target */
    readonly targetType: AttachmentTarget;

    /** ID of the target */
    readonly targetId: string;

    /** Priority for conflict resolution (lower = higher priority) */
    readonly priority?: number;
}

/** Input for creating a rule attachment */
export type CreateRuleAttachmentInput = Omit<RuleAttachment, 'id'>;
