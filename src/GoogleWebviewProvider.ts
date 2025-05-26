import * as vscode from 'vscode';
/**
 * Provedor de webview que exibe o Google em um iframe dentro do VS Code
 */
export class GoogleWebviewProvider implements vscode.WebviewViewProvider {
    /**
     * Identificador único da visualização utilizado para registro no VS Code
     */
    public static readonly viewType = 'googleWebview';
    /**
     * Cria uma nova instância do provedor de webview do Google
     * @param _extensionUri URI da extensão para carregar recursos locais
     */
    constructor(private readonly _extensionUri: vscode.Uri) {}
    /**
     * Método chamado pelo VS Code quando a visualização é inicializada
     * Configura o HTML e as opções do webview
     * @param webviewView A visualização do webview a ser configurada
     * @param context Contexto de resolução do webview
     * @param _token Token de cancelamento para operações assíncronas
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    }
    /**
     * Gera o conteúdo HTML para o webview
     * @param webview Instância do webview para o qual o HTML será gerado
     * @returns String contendo o HTML para exibir o iframe do Google
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Google</title>
            <style>
                body, html {
                    margin: 0;
                    padding: 0;
                    height: 100%;
                    width: 100%;
                }
                iframe {
                    border: none;
                    width: 100%;
                    height: 100%;
                }
            </style>
        </head>
        <body>
            <iframe src="https://www.google.com"></iframe>
        </body>
        </html>`;
    }
}
