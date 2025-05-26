/**
 * Valida um nome de arquivo para garantir que ele seja válido no sistema de arquivos
 * 
 * @param name Nome do arquivo a ser validado
 * @returns Mensagem de erro se o nome for inválido, ou null se for válido
 */
export function validateFileName(name: string): string | null {
    if (!name || name.trim().length === 0) {
        return "Nome não pode ser vazio.";
    }
    if (/[\\/:\*\?"<>\|]/.test(name)) {
        return 'Nome contém caracteres inválidos (\\ / : * ? " < > |).';
    }
    if (name === '.' || name === '..') {
        return 'Nome inválido.';
    }
    return null; 
}
