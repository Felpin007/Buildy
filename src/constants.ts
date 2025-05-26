/**
 * Chave para armazenar o hash do checkpoint Git criado antes da geração de estrutura
 * Utilizado pelo sistema de desfazer para restaurar o estado anterior
 */
export const LAST_PRE_GENERATION_CHECKPOINT_KEY = 'aiStructureGen.lastPreGenerationCheckpointHash';
/**
 * Chave para armazenar o hash do checkpoint Git criado após uma geração bem-sucedida
 * Utilizado para rastrear o estado após a geração
 */
export const LAST_SUCCESSFUL_GENERATION_CHECKPOINT_KEY = 'aiStructureGen.lastSuccessfulGenerationCheckpointHash';
/**
 * Chave para armazenar o hash do estado antes da última operação de desfazer
 * Utilizado para rastrear mudanças relacionadas ao sistema de desfazer
 */
export const LAST_UNDO_BEFORE_HASH_KEY = 'aiStructureGen.lastUndoBeforeHash';
/**
 * Chave para armazenar o hash do estado após a última operação de desfazer
 * Utilizado para rastrear mudanças relacionadas ao sistema de desfazer
 */
export const LAST_UNDO_AFTER_HASH_KEY = 'aiStructureGen.lastUndoAfterHash';
/**
 * Chave para armazenar o texto de prompt adicional personalizado pelo usuário
 * Este texto é adicionado ao prompt base para melhorar as respostas da IA
 */
export const ADDITIONAL_PROMPT_KEY = 'aiStructureGen.additionalPromptText';
