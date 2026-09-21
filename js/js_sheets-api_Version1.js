(() => {
  "use strict";

  const SHEETS_API_URL =
    "https://script.google.com/macros/s/1wyuS-fCNNSoQAtJQmwW_TMadmBkx60VixoSHw0eL_7g/exec";
  const STORAGE_KEY = "moneyflow-v2";
  const SYNC_FLAG = "moneyflow-sheets-syncing";
  let lastSavedState = localStorage.getItem(STORAGE_KEY) || "";
  let applyingRemoteState = false;

  async function loadRemoteState() {
    const response = await fetch(SHEETS_API_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load data from Google Sheets");

    const data = await response.json();
    return {
      incomes: convertIncomes(data.incomes || []),
      transactions: convertTransactions(data.transactions || []),
      categories: convertCategories(data.categories || [])
    };
  }

  async function saveRemoteState(state) {
    const response = await fetch(SHEETS_API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "replace",
        transactions: state.transactions || [],
        categories: state.categories || [],
        incomes: convertIncomesForSheet(state.incomes || {})
      })
    });

    if (!response.ok) throw new Error("Could not save data to Google Sheets");
    return response.json();
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

  async function pullOnStartup() {
    try {
      const remoteState = await loadRemoteState();
      const remoteHasData = remoteState.transactions.length ||
        remoteState.categories.length ||
        Object.keys(remoteState.incomes).length;
      const localState = localStorage.getItem(STORAGE_KEY);

      if (remoteHasData) {
        applyingRemoteState = true;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteState));
        lastSavedState = localStorage.getItem(STORAGE_KEY) || "";
        applyingRemoteState = false;
        if (!localState || localState !== lastSavedState) location.reload();
      }
    } catch (error) {
      console.warn("Google Sheets load failed; using local data:", error);
    }
  }

  async function pushCurrentState(serialized) {
    if (applyingRemoteState || !serialized || serialized === lastSavedState) return;

    try {
      const state = JSON.parse(serialized);
      localStorage.setItem(SYNC_FLAG, "1");
      await saveRemoteState(state);
      lastSavedState = serialized;
    } catch (error) {
      console.warn("Google Sheets save failed; data remains in local storage:", error);
    } finally {
      localStorage.removeItem(SYNC_FLAG);
    }
  }

  function watchLocalChanges() {
    setInterval(() => {
      if (localStorage.getItem(SYNC_FLAG)) return;
      const serialized = localStorage.getItem(STORAGE_KEY) || "";
      if (serialized !== lastSavedState) pushCurrentState(serialized);
    }, 700);
  }

  window.loadRemoteState = loadRemoteState;
  window.saveRemoteState = saveRemoteState;
  window.addEventListener("online", () => {
    const serialized = localStorage.getItem(STORAGE_KEY) || "";
    pushCurrentState(serialized);
  });

  pullOnStartup();
  watchLocalChanges();
})();
