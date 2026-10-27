export function finOpsApi(endpoint) {
    const apiUrl = `${process.env.FINOPS_URL}/${endpoint}`;
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');
    headers.append('Accept', 'application/json');

    return {
        get: async () => {
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers,
            })

            return response.json();
        },
        post: async (body) => {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            })

            return response.json();
        },
    }
}