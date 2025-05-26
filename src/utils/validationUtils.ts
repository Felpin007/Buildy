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
