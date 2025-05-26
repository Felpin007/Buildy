/**
 * Constantes para os comandos trocados entre a extensão e o webview
 */
export const WebviewCommands = {
    // Comandos enviados do webview para a extensão
    GET_STRUCTURE: 'getStructure',
    GENERATE_STRUCTURE: 'generateStructure',
    SHOW_DIFF: 'showDiff',
    UNDO_LAST_GENERATION: 'undoLastGeneration',
    SAVE_ADDITIONAL_PROMPT: 'saveAdditionalPrompt',
    REQUEST_INITIAL_ADDITIONAL_PROMPT: 'requestInitialAdditionalPrompt',
    COPY_SELECTED_FILES_CONTENT: 'copySelectedFilesContent',
    OPEN_FILE: 'openFile',
    SHOW_ERROR: 'showError',
    SHOW_INFO: 'showInfo',
    REQUEST_INITIAL_UNDO_STATE: 'requestInitialUndoState',
    GET_PROMPT_CONTENT: 'getPromptContent',

    // Comandos enviados da extensão para o webview
    STRUCTURE_DATA: 'structureData',
    SET_LOADING: 'setLoading',
    WORKSPACE_CHANGED: 'workspaceChanged',
    UPDATE_UNDO_STATE: 'updateUndoState',
    UPDATE_ADDITIONAL_PROMPT: 'updateAdditionalPrompt',
    GENERATION_STARTED: 'generationStarted',
    GENERATION_PROGRESS: 'generationProgress',
    GENERATION_FINISHED: 'generationFinished',
    PROMPT_CONTENT: 'promptContent'
};
