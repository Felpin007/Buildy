import fs from 'fs/promises';
import * as vscode from 'vscode';
export async function fileExistsAtPath(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            return false;
        }
        console.error(`Error checking existence of ${filePath}:`, error);
        return false;
    }
}
