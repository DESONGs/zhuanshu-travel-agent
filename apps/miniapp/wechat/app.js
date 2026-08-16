App({
  globalData: { apiBaseUrl: "", sessionToken: "", trips: [] },
  request(path, options = {}) {
    const apiBaseUrl = this.globalData.apiBaseUrl;
    if (!apiBaseUrl) return Promise.reject({ code: "api_base_not_configured" });
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${apiBaseUrl.replace(/\/$/, "")}${path}`,
        method: options.method || "GET",
        data: options.data,
        header: { "content-type": "application/json", ...(this.globalData.sessionToken ? { Authorization: `Bearer ${this.globalData.sessionToken}` } : {}) },
        success: (response) => response.statusCode >= 200 && response.statusCode < 300 ? resolve(response.data) : reject(response.data || { code: "request_failed" }),
        fail: () => reject({ code: "network_unavailable" }),
      });
    });
  },
});
