// src/utils/fs.ts
import fs from 'fs/promises';
import * as vscode from 'vscode';

/**
 * Checks if a file or directory exists at the given path.
 * @param filePath The absolute path to check.
 * @returns True if the path exists, false otherwise.
 */
export async function fileExistsAtPath(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch (error: any) {
        // Check if the error code indicates that the file doesn't exist
        if (error.code === 'ENOENT') {
            return false;
        }
        // Re-throw other errors (e.g., permissions issues)
        console.error(`Error checking existence of ${filePath}:`, error);
        // Depending on desired behavior, you might want to return false or throw
        // Returning false is safer if you just want to know if it's accessible *or* non-existent
        return false;
        // throw error; // Uncomment to throw other errors
    }
}

// Add other common FS utilities if needed later