// Clientes HTTP para as APIs dos outros grupos da esteira. Cada um lê a URL base de uma variável
// do .env; se a variável estiver vazia, `configurada` é false e quem chama decide pular o envio.

// Tempo máximo esperando o outro grupo responder. Sem isso, uma API fora do ar travaria a nossa.
const TEMPO_LIMITE_MS = 10_000;

function clienteApi(variavelUrl, endpoint) {
    const base = (process.env[variavelUrl] ?? '').trim().replace(/\/+$/, ''); // tira a "/" do fim
    const apiUrl = `${base}/${endpoint.replace(/^\/+/, '')}`;
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };

    async function chama(method, body) {
        const response = await fetch(apiUrl, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
        });
        // fetch NÃO lança erro em 4xx/5xx: precisamos olhar response.ok nós mesmos.
        if (!response.ok) {
            const texto = await response.text();
            throw new Error(`${method} ${apiUrl} respondeu ${response.status}: ${texto.slice(0, 500)}`);
        }
        return response.json();
    }

    return {
        configurada: base !== '',
        url: apiUrl,
        get: () => chama('GET'),
        post: (body) => chama('POST', body),
    };
}

// FinOps (grupo financeiro). Ex.: finOpsApi('operacoes').post(operacao)
export function finOpsApi(endpoint) {
    return clienteApi('FINOPS_URL', endpoint);
}

// Esteira de Documentos (grupo 6, API em Python). Ex.: documentosApi('api/documentos/juros').post(operacao)
export function documentosApi(endpoint) {
    return clienteApi('DOCUMENTOS_URL', endpoint);
}
