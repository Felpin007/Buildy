# Buildy

[View extension page](https://marketplace.visualstudio.com/items/?itemName=FelpolinColorado.buildy)

Use AI-generated responses in a specific format to automatically generate everything and quickly update your codebase.  
We recommend using the best current AI model: [Gemini 2.5 Pro](https://aistudio.google.com)

## How to Use

1.  Install the extension in VS Code.
2.  Use the AI to generate a response in the specified format. (Copy the Windows or Linux version of the prompt)
3.  Paste the response into the extension and click the "Generate" button.
4.  The extension will execute the instructions and update your codebase accordingly.

## Features

*   **Generate Structure:** Uses AI instructions to automatically create, modify, or delete files and folders.
*   **Execute Commands:** Runs terminal commands directly in VS Code (PowerShell/Bash).
*   **Write Files:** Creates or updates files with the provided content.
*   **Undo:** Restores files to their previous state (requires Git).
*   **Browse Files:** Displays a simple file tree so you can easily copy file contents.
*   **Customizable Prompts:** Add fixed custom instructions to the base prompt to improve AI output.

## Interface

**Structure Generator:** Paste the AI's XML response and click the button to generate. If something goes wrong, click “Undo”.

**Copy System:** Browse your project files, check the ones you want, and copy their content easily.

## Requirements

*   Visual Studio Code (v1.90.0 or higher)
*   Git (required for the undo feature)

## Limitations

*   The "Undo" feature is experimental.
*   The AI must follow the format properly, or generation may fail.
*   Some terminal commands might not be handled in all edge cases.
