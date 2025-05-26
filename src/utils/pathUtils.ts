export function escapePath(p: string): string {
    const normalized = p.replace(/\\/g, "/");
    return normalized.replace(/'/g, "''");
}
