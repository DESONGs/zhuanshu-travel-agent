App({
  apiBaseUrl: "",
  sessionToken: "",
  request(path, options = {}) {
    if (!this.apiBaseUrl) return Promise.reject({ code: "api_base_not_configured" });
    return new Promise((resolve, reject) => {
      my.request({
        url: `${this.apiBaseUrl.replace(/\/$/, "")}${path}`,
        method: options.method || "GET",
        data: options.data,
        headers: { "Content-Type": "application/json", ...(this.sessionToken ? { Authorization: `Bearer ${this.sessionToken}` } : {}) },
        success: (response) => response.status >= 200 && response.status < 300 ? resolve(response.data) : reject(response.data || { code: "request_failed" }),
        fail: () => reject({ code: "network_unavailable" }),
      });
    });
  },
});
