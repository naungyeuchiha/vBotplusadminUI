(() => {
  "use strict";

  const SHEETS_API_URL =
    "https://script.google.com/macros/s/1wyuS-fCNNSoQAtJQmwW_TMadmBkx60VixoSHw0eL_7g/exec";

  async function loadRemoteState() {
    const response = await fetch(`${SHEETS_API_URL}?read=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      credentials: "omit"
    });

    if (!response.ok) throw new Error(`Google Sheets GET failed: HTTP ${response.status}`);

    const data = await response.json();
    return {
      incomes: convertIncomes(data.incomes || []),
      transactions: convertTransactions(data.transactions || []),
      categories: convertCategories(data.categories || [])
    };
  }

  function saveRemoteState(state) {
    const payload = JSON.stringify({
      action: "replace",
      transactions: Array.isArray(state.transactions) ? state.transactions : [],
      categories: Array.isArray(state.categories) ? state.categories : [],
      incomes: convertIncomesForSheet(state.incomes || {})
    });
    const url = `${SHEETS_API_URL}?write=${Date.now()}`;

    // sendBeacon is designed for cross-origin fire-and-forget writes and does
    // not require the CORS preflight that breaks browser fetch POST requests.
    if (navigator.sendBeacon) {
      const accepted = navigator.sendBeacon(
        url,
        new Blob([payload], { type: "text/plain;charset=UTF-8" })
      );
      if (accepted) return Promise.resolve({ ok: true, dispatched: true });
    }

    // Fallback for browsers that reject sendBeacon. Do not use
    // Content-Type: application/json because that triggers a preflight.
    return fetch(url, {
      method: "POST",
      mode: "no-cors",
      credentials: "omit",
      cache: "no-store",
      body: payload
    }).then((response) => {
      if (response.type === "opaque" || response.ok) {
        return { ok: true, dispatched: true };
      }
      throw new Error(`Google Sheets POST failed: HTTP ${response.status}`);
    });
  }

  function convertTransactions(rows) {
    return rows.map(row => ({
      id: String(row.id || crypto.randomUUID()),
      type: String(row.type || "expense"),
      amount: Number(row.amount || 0),
      date: formatSheetDate(row.date),
      category: String(row.category || "Uncategorized"),
      note: String(row.note || ""),
      updatedAt: String(row.updatedAt || "")
    }));
  }

  function convertCategories(rows) {
    return rows.filter(row => row.name).map(row => ({
      name: String(row.name),
      type: String(row.type || "expense")
    }));
  }

  function convertIncomes(rows) {
    const result = {};
    rows.forEach(row => {
      if (row.month) result[String(row.month)] = Number(row.amount || 0);
    });
    return result;
  }

  function convertIncomesForSheet(incomes) {
    return Object.entries(incomes).map(([month, amount]) => ({ month, amount }));
  }

  function formatSheetDate(value) {
    if (!value) return "";
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 10);
  }

  window.loadRemoteState = loadRemoteState;
  window.saveRemoteState = saveRemoteState;
})();
