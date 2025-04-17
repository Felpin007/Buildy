// src/services/parserService.ts

/**
 * Represents an operation derived from the custom format,
 * either a shell command or writing code to a file.
 */
export interface Operation {
    type: 'command' | 'code';
    value: string; // Command string or relative file path
    content?: string[]; // Lines of code content for 'code' type
}

/**
 * Parses the custom input format containing <comando> and <codigo> tags.
 * Extracts operations to be executed.
 * @param inputText The raw input string containing the custom format.
 * @returns An array of Operation objects.
 */
export function parseCustomFormat(inputText: string): Operation[] {
    const operations: Operation[] = [];
    // Regex to capture content within <comando>...</comando> or <codigo ref="...">...</codigo>
    const tagRegex = /<command>\s*([\s\S]*?)\s*<\/command>|<code ref="(.*?)">\s*([\s\S]*?)\s*<\/code>/gis;
    let match;

    // Consider only text after the last '-----' line (if any)
    let relevantText = inputText.split(/^-{5,}\s*$/m).pop() || inputText;
    // Remove <texto> blocks first, as they are just informational
    relevantText = relevantText.replace(/<text>.*?<\/text>/gis, '');

    while ((match = tagRegex.exec(relevantText)) !== null) {
        if (match[1] !== undefined) { // Matched <comando>
            const command = match[1].trim();
            if (command) {
                operations.push({ type: 'command', value: command });
            }
        } else if (match[2] !== undefined && match[3] !== undefined) { // Matched <codigo>
            const filePath = match[2].trim();
            // Normalize path separators to forward slashes for internal consistency
            const normalizedPath = filePath.replace(/\\/g, '/');
            // Clean up code content: remove leading newline, trailing whitespace, split into lines
            const codeContent = match[3].replace(/^\r?\n/, '').replace(/\s*$/, '').split(/\r?\n/);
            if (normalizedPath) {
                 operations.push({ type: 'code', value: normalizedPath, content: codeContent });
            }
        }
    }

    if (operations.length === 0 && relevantText.trim() !== '') {
        // Log a warning if the relevant text wasn't empty but no operations were found
        console.warn("[parseCustomFormat] No <comando> or <codigo> operations found in relevant input text after filtering.");
    }

    return operations;
}