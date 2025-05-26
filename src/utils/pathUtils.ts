/**
 * Escapa um caminho de arquivo para uso seguro em comandos e strings
 * 
 * @param p Caminho a ser escapado
 * @returns Caminho normalizado com barras e aspas escapadas
 */
export function escapePath(p: string): string {
    const normalized = p.replace(/\\/g, "/");
    return normalized.replace(/'/g, "''");
}
