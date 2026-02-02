import { supabase } from '../lib/supabase';
import type { Session, Response } from '../domain/models';

// 1️⃣ Session Creation (ONCE)
export const createSession = async (
    userId: string,
    experienceId: string
): Promise<string | null> => {
    if (!supabase) {
        console.warn('[MockPersistence] createSession', { userId, experienceId });
        return 'mock-session-id-' + Date.now();
    }

    const { data, error } = await supabase
        .from('sessions')
        .insert({
            user_id: userId,
            experience_id: experienceId,
            status: 'active',
            started_at: new Date().toISOString()
        })
        .select('id')
        .single();

    if (error) {
        console.error('Failed to create session:', error);
        return null;
    }

    return data.id;
};

// 2️⃣ Response Insertion (MANY)
export const insertResponse = async (
    sessionId: string,
    contentUnitId: string,
    unitType: string,
    value: any
): Promise<void> => {
    if (!supabase) {
        console.warn('[MockPersistence] insertResponse', { sessionId, contentUnitId, value });
        return;
    }

    const { error } = await supabase
        .from('responses')
        .insert({
            session_id: sessionId,
            content_unit_id: contentUnitId,
            type: unitType,
            data: value,
            submitted_at: new Date().toISOString()
        });

    if (error) {
        console.error('Failed to insert response:', error);
    }
};

// 3️⃣ Session Finalization (ONE UPDATE)
export const finalizeSession = async (sessionId: string): Promise<void> => {
    if (!supabase) {
        console.warn('[MockPersistence] finalizeSession', { sessionId });
        return;
    }

    const { error } = await supabase
        .from('sessions')
        .update({
            status: 'completed',
            completed_at: new Date().toISOString()
        })
        .eq('id', sessionId);

    if (error) {
        console.error('Failed to finalize session:', error);
    }
};

// 4️⃣ Fetch Responses (For Scoring)
export const getResponses = async (sessionId: string): Promise<Response[]> => {
    if (!supabase) {
        console.warn('[MockPersistence] getResponses', { sessionId });
        return [];
    }

    const { data, error } = await supabase
        .from('responses')
        .select('*')
        .eq('session_id', sessionId);

    if (error) {
        console.error('Failed to fetch responses:', error);
        return [];
    }

    // Map snake_case to camelCase
    return data.map((r: any) => ({
        id: r.id,
        sessionId: r.session_id,
        contentUnitId: r.content_unit_id,
        type: r.type,
        data: r.data,
        submittedAt: r.submitted_at
    }));
};

// 5️⃣ Persist Evaluation (RESULT)
export const persistEvaluation = async (sessionId: string, result: any): Promise<void> => {
    if (!supabase) {
        console.warn('[MockPersistence] persistEvaluation', { sessionId, result });
        return;
    }

    const { error } = await supabase
        .from('evaluations')
        .insert({
            session_id: sessionId,
            method: 'auto_mock',
            status: 'completed',
            result: result,
            evaluated_at: new Date().toISOString()
        });

    if (error) {
        console.error('Failed to persist evaluation:', error);
    }
};
