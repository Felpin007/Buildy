/**
 * Constantes para os comandos trocados entre a extensão e o webview
 * 
 * Estas constantes definem os tipos de mensagens que podem ser enviadas entre
 * a extensão principal e os webviews, permitindo a comunicação bidirecional.
 * São utilizadas para padronizar os nomes dos comandos e evitar erros de digitação.
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
    COPY_FILES_TO_CLIPBOARD: 'copyFilesToClipboard',
    COPY_DIFF_TO_CLIPBOARD: 'copyDiffToClipboard',
    CREATE_SOLUTION_FILE: 'createSolutionFile',
    DELETE_SOLUTION_FILE: 'deleteSolutionFile',
    WEBVIEW_READY: 'webviewReady',

    // Comandos enviados da extensão para o webview
    SHOW_INTERNAL_NOTIFICATION: 'showInternalNotification',
    UNDO_FINISHED: 'undoFinished',
    UNDO_PROGRESS_ERROR: 'undoProgressError',
    UNDO_PROGRESS: 'undoProgress',
    UNDO_PROGRESS_START: 'undoProgressStart',
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
