/**
 * Pure ledger constants shared by server actions and client components.
 * Kept out of the `'use server'` actions module (which may only export async
 * functions) and out of client-only modules (the server imports it too).
 */

/** Gold a player may self-grant once per loop, without DM approval (feedback #4). */
export const LOOP_CREDIT_GP = 500
