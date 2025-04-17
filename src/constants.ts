// src/constants.ts

// Key for storing the hash of the checkpoint created *before* the last generation attempt
export const LAST_PRE_GENERATION_CHECKPOINT_KEY = 'aiStructureGen.lastPreGenerationCheckpointHash';

// --- MODIFICATION START ---
// Key for storing the hash of the checkpoint created *after* the last successful generation
export const LAST_SUCCESSFUL_GENERATION_CHECKPOINT_KEY = 'aiStructureGen.lastSuccessfulGenerationCheckpointHash';
// --- MODIFICATION END ---

// --- MODIFICATION START: Add keys for undo diff ---
// Key for storing the hash of the state *before* the last undo operation
export const LAST_UNDO_BEFORE_HASH_KEY = 'aiStructureGen.lastUndoBeforeHash';
// Key for storing the hash of the state *after* the last undo operation (the state reverted TO)
export const LAST_UNDO_AFTER_HASH_KEY = 'aiStructureGen.lastUndoAfterHash';
// --- MODIFICATION END ---

// --- MODIFICATION START: Add key for additional prompt text ---
export const ADDITIONAL_PROMPT_KEY = 'aiStructureGen.additionalPromptText';
// --- MODIFICATION END ---

// Constants related to the old Git implementation (removed):
// export const LAST_CHECKPOINT_KEY = 'aiStructureGen.lastCheckpointHash';
// export const CHECKPOINT_COMMIT_PREFIX = 'AI Structure Gen: Checkpoint';
// export const AUTO_COMMIT_MESSAGE = 'AI Structure Gen: Applied generated structure';
// export const DELETE_COMMIT_MESSAGE = 'AI Structure Gen: Deleted selected items';
// export const INITIAL_COMMIT_MESSAGE = 'Initial commit (auto-created by AI Structure Gen)';
// export const GITIGNORE_CONTENT = `# Common generated/system files...`; // Content removed

// Add other constants if needed

