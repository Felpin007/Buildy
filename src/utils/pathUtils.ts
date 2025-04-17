// src/utils/pathUtils.ts

/**
 * Escapes a path for safe use within PowerShell single-quoted strings.
 * Replaces single quotes with two single quotes and normalizes slashes to backslashes.
 * @param p The path string to escape.
 * @returns The escaped path string.
 */
export function escapePath(p: string): string {
    // Escape for PowerShell strings
    const normalized = p.replace(/\//g, '\\');
    return normalized.replace(/'/g, "''");
}