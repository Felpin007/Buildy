/**
 * Gera um valor nonce aleatório para uso em políticas de segurança de conteúdo (CSP)
 * 
 * O nonce é utilizado para permitir a execução de scripts específicos em webviews
 * com políticas de segurança restritas, ajudando a prevenir ataques XSS
 * 
 * @returns Uma string aleatória de 32 caracteres para uso como nonce
 */
export function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
