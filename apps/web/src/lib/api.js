async function request(path, init) {
    const response = await fetch(path, {
        headers: {
            "Content-Type": "application/json"
        },
        ...init
    });
    if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
    }
    return response.json();
}
export const api = {
    getDefaultConfig() {
        return request("/api/config/default");
    },
    previewFilter(payload) {
        return request("/api/filter/preview", {
            method: "POST",
            body: JSON.stringify(payload)
        });
    },
    transformPrompt(payload) {
        return request("/api/prompt/transform", {
            method: "POST",
            body: JSON.stringify(payload)
        });
    },
    processOutput(payload) {
        return request("/api/output/process", {
            method: "POST",
            body: JSON.stringify(payload)
        });
    }
};
