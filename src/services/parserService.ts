export interface Operation {
    type: 'command' | 'code';
    value: string; 
    content?: string[]; 
}
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
