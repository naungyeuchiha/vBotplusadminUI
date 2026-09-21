const SHEETS_API_URL =
  "https://script.google.com/macros/s/1wyuS-fCNNSoQAtJQmwW_TMadmBkx60VixoSHw0eL_7g/exec";

async function loadRemoteState() {
  const response = await fetch(SHEETS_API_URL);

  if (!response.ok) {
    throw new Error("Could not load data from Google Sheets");
  }

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
      transactions: state.transactions,
      categories: state.categories,
      incomes: convertIncomesForSheet(state.incomes)
    })
  });

  if (!response.ok) {
    throw new Error("Could not save data to Google Sheets");
  }

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
    updatedAt: row.updatedAt || ""
  }));
}

function convertCategories(rows) {
  return rows
    .filter(row => row.name)
    .map(row => ({
      name: String(row.name),
      type: String(row.type || "expense")
    }));
}

function convertIncomes(rows) {
  const result = {};

  rows.forEach(row => {
    if (row.month) {
      result[String(row.month)] = Number(row.amount || 0);
    }
  });

  return result;
}

function convertIncomesForSheet(incomes) {
  return Object.entries(incomes).map(([month, amount]) => ({
    month,
    amount
  }));
}

function formatSheetDate(value) {
  if (!value) return "";

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toISOString().slice(0, 10);
}