import fs from 'fs/promises';
import * as vscode from 'vscode';
/**
 * Verifica se um arquivo existe no caminho especificado
 * 
 * @param filePath Caminho completo do arquivo a ser verificado
 * @returns Promise que resolve para true se o arquivo existir, ou false caso contrário
 */
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
