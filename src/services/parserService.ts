/**
 * Interface que representa uma operação a ser executada pelo sistema
 * Pode ser um comando de terminal ou código a ser escrito em um arquivo
 */
export interface Operation {
    /** Tipo da operação: 'command' para comandos de terminal ou 'code' para conteúdo de arquivo */
    type: 'command' | 'code';
    /** Para comandos: o comando a ser executado. Para código: o caminho do arquivo */
    value: string; 
    /** Para operações de código: conteúdo do arquivo como array de linhas */
    content?: string[]; 
}
/**
 * Analisa o texto de entrada no formato personalizado da extensão
 * Extrai comandos e blocos de código com seus caminhos de arquivo
 * 
 * @param inputText Texto de entrada gerado pela IA no formato XML personalizado
 * @returns Array de operações a serem executadas
 */
export function parseCustomFormat(inputText: string): Operation[] {
    const operations: Operation[] = [];
    const tagRegex = /<command>\s*([\s\S]*?)\s*<\/command>|<code ref="(.*?)">\s*([\s\S]*?)\s*<\/code>/gis;
    let match;
    let relevantText = inputText.split(/^-{5,}\s*$/m).pop() || inputText;
    relevantText = relevantText.replace(/<text>.*?<\/text>/gis, '');
    while ((match = tagRegex.exec(relevantText)) !== null) {
        if (match[1] !== undefined) { 
            const command = match[1].trim();
            if (command) {
                operations.push({ type: 'command', value: command });
            }
        } else if (match[2] !== undefined && match[3] !== undefined) { 
            const filePath = match[2].trim();
            const normalizedPath = filePath.replace(/\\/g, '/');
            const codeContent = match[3].replace(/^\r?\n/, '').replace(/\s*$/, '').split(/\r?\n/);
            if (normalizedPath) {
                 operations.push({ type: 'code', value: normalizedPath, content: codeContent });
            }
        }
    }
    if (operations.length === 0 && relevantText.trim() !== '') {
        console.warn("[parseCustomFormat] No <comando> or <codigo> operations found in relevant input text after filtering.");
    }
    return operations;
}
