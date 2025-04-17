// src/utils/validationUtils.ts

/**
 * Validates a potential file or folder name.
 * @param name The name to validate.
 * @returns An error message string if invalid, or null if valid.
 */
export function validateFileName(name: string): string | null {
    if (!name || name.trim().length === 0) {
        return "Nome não pode ser vazio.";
    }
    // Basic check for common invalid characters in file/folder names (Windows/Unix)
    if (/[\\/:\*\?"<>\|]/.test(name)) {
        return 'Nome contém caracteres inválidos (\\ / : * ? " < > |).';
    }
    if (name === '.' || name === '..') {
        return 'Nome inválido.';
    }
    // Add other checks if needed (e.g., reserved names on Windows)
    return null; // Valid
}