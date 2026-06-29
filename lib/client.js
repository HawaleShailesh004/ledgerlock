/**
 * Minimal HTTP client for LedgerLock B2B integration (Phase 1C).
 * Works in Node 18+ and browsers.
 */
export class LedgerLockClient {
  constructor(baseUrl, { fetchImpl } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    // fetch must not be called unbound (browser throws "Illegal invocation").
    const impl = fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.fetch = (...args) => impl(...args);
  }

  async appendEvent({ tenantId, actor, action, payload = {}, flagged = false }) {
    const res = await this.fetch(`${this.baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, actor, action, payload, flagged }),
    });
    const data = await res.json();
    if (!res.ok || data?.ok === false) {
      throw new Error(data?.error || `append_failed_${res.status}`);
    }
    return data;
  }

  async listEvents(tenantId, { limit, afterKey } = {}) {
    const params = new URLSearchParams({ tenantId });
    if (limit) params.set("limit", String(limit));
    if (afterKey) params.set("afterKey", afterKey);
    const res = await this.fetch(`${this.baseUrl}/api/events?${params}`);
    return res.json();
  }

  async verify(tenantId, { mode = "since-seal" } = {}) {
    const res = await this.fetch(`${this.baseUrl}/api/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, mode }),
    });
    return res.json();
  }

  async getCheckpoint(tenantId, { eventCount } = {}) {
    const params = new URLSearchParams({ tenantId });
    if (eventCount) params.set("eventCount", String(eventCount));
    const res = await this.fetch(`${this.baseUrl}/api/checkpoint?${params}`);
    return res.json();
  }

  async getAlerts(tenantId, { limit = 50 } = {}) {
    const res = await this.fetch(
      `${this.baseUrl}/api/alerts?tenantId=${encodeURIComponent(tenantId)}&limit=${limit}`,
    );
    return res.json();
  }

  async getProof(tenantId, seq) {
    const res = await this.fetch(
      `${this.baseUrl}/api/proof?tenantId=${encodeURIComponent(tenantId)}&seq=${seq}`,
    );
    return res.json();
  }

  async getTenantStats(tenantId) {
    const res = await this.fetch(
      `${this.baseUrl}/api/tenant-stats?tenantId=${encodeURIComponent(tenantId)}`,
    );
    return res.json();
  }
}
