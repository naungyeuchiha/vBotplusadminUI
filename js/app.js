(() => {
  "use strict";

  const KEY = "moneyflow-v2";
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, "0");
  const d0 = new Date();
  const today = `${d0.getFullYear()}-${pad(d0.getMonth() + 1)}-${pad(d0.getDate())}`;

  const defaults = [
    { name: "Food & Drinks", type: "expense" },
    { name: "Transportation", type: "expense" },
    { name: "Family", type: "expense" },
    { name: "Household", type: "expense" },
    { name: "Utilities", type: "expense" },
    { name: "Shopping", type: "expense" },
    { name: "Salary", type: "income" },
    { name: "Freelance", type: "income" },
    { name: "Bank Loan", type: "loan" },
    { name: "Credit Card", type: "credit" }
  ];

  let state = load();
  let month = today.slice(0, 7);
  let formType = "expense";
  let syncInFlight = false;

  $("month").value = month;
  $("date").value = today;

  function load() {
    try {
      const x = JSON.parse(localStorage.getItem(KEY));
      if (x && Array.isArray(x.categories) && Array.isArray(x.transactions)) return x;
    } catch (error) {
      console.warn("Failed to load local app state", error);
    }

    return { incomes: {}, transactions: [], categories: defaults.map(item => ({ ...item })) };
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(state));

    if (typeof saveRemoteState === "function") {
      if (syncInFlight) return;
      syncInFlight = true;

      saveRemoteState(state)
        .then(() => {
          syncInFlight = false;
        })
        .catch((error) => {
          syncInFlight = false;
          console.warn("Google Sheets save failed; local data remains saved.", error);
          toast("Saved locally; Google sync failed.");
        });
    }
  }

  function loadRemoteToState() {
    if (typeof loadRemoteState !== "function") return;

    loadRemoteState()
      .then((remote) => {
        const hasRemoteData =
          (remote && Array.isArray(remote.transactions) && remote.transactions.length) ||
          (remote && Array.isArray(remote.categories) && remote.categories.length) ||
          (remote && remote.incomes && Object.keys(remote.incomes).length > 0);

        if (!hasRemoteData) return;

        state = {
          incomes: remote.incomes || {},
          transactions: remote.transactions || [],
          categories: remote.categories && remote.categories.length ? remote.categories : defaults.map(item => ({ ...item }))
        };

        localStorage.setItem(KEY, JSON.stringify(state));
        render();
      })
      .catch((error) => {
        console.warn("Could not load remote state from Google Sheets.", error);
      });
  }

  function money(n) {
    return `${Math.round(n).toLocaleString("en-US")} MMK`;
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  }

  function txMonth() {
    return state.transactions.filter((x) => x.date && x.date.slice(0, 7) === month);
  }

  function totals() {
    const tx = txMonth();
    const income = tx.filter((x) => x.type === "income").reduce((s, x) => s + Number(x.amount || 0), 0) + Number(state.incomes[month] || 0);
    const expense = tx.filter((x) => x.type === "expense").reduce((s, x) => s + Number(x.amount || 0), 0);
    const loan = tx.filter((x) => x.type === "loan").reduce((s, x) => s + Number(x.amount || 0), 0);
    const credit = tx.filter((x) => x.type === "credit").reduce((s, x) => s + Number(x.amount || 0), 0);
    return { income, expense, loan, credit, tx };
  }

  function render() {
    const t = totals();
    $("incomeTotal").textContent = money(t.income);
    $("expenseTotal").textContent = money(t.expense);
    $("loanTotal").textContent = money(t.loan);
    $("creditTotal").textContent = money(t.credit);
    $("remaining").textContent = money(t.income - t.expense - t.loan - t.credit);

    const implementedBreakdown = [...t.tx].filter((x) => x.type !== "income");
    const groups = {};
    implementedBreakdown.forEach((x) => {
      groups[x.category] = (groups[x.category] || 0) + Number(x.amount || 0);
    });

    const breakdown = Object.entries(groups)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => `
        <div class="activity">
          <span>${esc(name)}</span>
          <b>${money(value)}</b>
        </div>
      `).join("") || "<div class='empty'>No data yet</div>";

    $("breakdown").innerHTML = breakdown;
    renderRecent(t.tx);
    renderAnalysis(t);
    renderRows(t.tx);
    renderSettings();
    refreshCategorySelect();
  }

  function renderBreakdown(t) {
    const groups = {};
    t.tx.filter((x) => x.type !== "income").forEach((x) => {
      groups[x.category] = (groups[x.category] || 0) + Number(x.amount || 0);
    });

    const items = Object.entries(groups).sort((a, b) => b[1] - a[1]);
    $("breakdown").innerHTML = items.length ? items.map(([name, value]) => `
      <div class="activity"><span>${esc(name)}</span><b>${money(value)}</b></div>
    `).join("") : "<div class='empty'>No data yet</div>";
  }

  function icon(type) {
    return type === "income" ? "↗" : type === "loan" ? "↘" : type === "credit" ? "◈" : "−";
  }

  function typeName(type) {
    return type === "income" ? "Income" : type === "loan" ? "Loan Payment" : type === "credit" ? "Credit Payback" : "Expense";
  }

  function renderRecent(tx) {
    const arr = [...tx].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    $("recent").innerHTML = arr.length ? arr.map((x) => `
      <div class="activity"><div class="activity-icon">${icon(x.type)}</div><div><strong>${esc(typeName(x.type))}</strong><small>${esc(x.category || "Uncategorized")}</small></div><b>${money(Number(x.amount || 0))}</b></div>
    `).join("") : "<div class='empty'>No recent activity</div>";
  }

  function renderAnalysis(t) {
    $("analysisFlow").innerHTML = `
      <div class="activity"><span>Income</span><b class="income-text">+${money(t.income)}</b></div>
      <div class="activity"><span>Living expenses</span><b class="expense-text">-${money(t.expense)}</b></div>
      <div class="activity"><span>Loans</span><b class="loan-text">-${money(t.loan)}</b></div>
      <div class="activity"><span>Credit paybacks</span><b class="credit-text">-${money(t.credit)}</b></div>
    `;

    const totalSpent = t.expense + t.loan + t.credit;
    const remaining = t.income - totalSpent;
    $("analysisCats").innerHTML = `
      <div class="activity"><span>Remaining</span><b>${money(remaining)}</b></div>
      <div class="activity"><span>Committed</span><b>${money(totalSpent)}</b></div>
    `;
  }

  function renderRows(tx) {
    const arr = [...tx].sort((a, b) => b.date.localeCompare(a.date));
    $("txCount").textContent = `${arr.length} transaction${arr.length === 1 ? "" : "s"}`;
    $("txRows").innerHTML = arr.length ? arr.map((x) => `
      <tr>
        <td>${esc(x.date || "")}</td>
        <td>${esc(typeName(x.type))}</td>
        <td>${esc(x.category || "Uncategorized")}</td>
        <td>${money(Number(x.amount || 0))}</td>
        <td>${esc(x.note || "")}</td>
      </tr>
    `).join("") : "<tr><td colspan='5'>No transactions yet</td></tr>";
  }

  function categoriesFor(type) {
    return state.categories.filter((x) => x.type === type);
  }

  function refreshCategorySelect() {
    const list = categoriesFor(formType);
    $("category").innerHTML = list.length ? list.map((x) => `<option>${esc(x.name)}</option>`).join("") : '<option>Uncategorized</option>';
  }

  function setFormType(type) {
    formType = type;
    document.querySelectorAll("[data-formtype]").forEach((b) => b.classList.toggle("active", b.dataset.formtype === type));
    $("formTitle").textContent = {
      expense: "Add Expense",
      income: "Add Income",
      loan: "Add Loan Payment",
      credit: "Add Credit Payback"
    }[type];
    refreshCategorySelect();
  }

  function show(page) {
    document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === page));
    document.querySelectorAll(".bottom-nav [data-page]").forEach((b) => b.classList.toggle("active", b.dataset.page === page));
  }

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 1800);
  }

  document.addEventListener("click", (e) => {
    const pageButton = e.target.closest("[data-page]");
    if (pageButton) show(pageButton.dataset.page);

    const quickAdd = e.target.closest("[data-add]");
    if (quickAdd) {
      setFormType(quickAdd.dataset.add);
      show("add");
    }

    const formTypeButton = e.target.closest("[data-formtype]");
    if (formTypeButton) setFormType(formTypeButton.dataset.formtype);
  });

  $("month").addEventListener("change", (e) => {
    month = e.target.value || month;
    render();
  });

  $("txForm").addEventListener("submit", (e) => {
    e.preventDefault();

    const amount = Number($("amount").value);
    const date = $("date").value;
    if (!date || !Number.isFinite(amount) || amount <= 0) {
      toast("Enter a valid amount and date.");
      return;
    }

    const category = $("category").value || "Uncategorized";
    const note = $("note").value.trim();

    state.transactions.push({
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      type: formType,
      amount,
      date,
      category,
      note,
      updatedAt: new Date().toISOString()
    });

    save();
    render();
    $("txForm").reset();
    $("date").value = today;
    setFormType(formType);
    toast("Saved to local storage and Google Sheets");
  });

  $("clearBtn").addEventListener("click", () => {
    if (!confirm("Delete all transactions and income records?")) return;
    state = { incomes: {}, transactions: [], categories: defaults.map(item => ({ ...item })) };
    save();
    render();
    toast("All data cleared");
  });

  function renderSettings() {
    const types = ["expense", "income", "loan", "credit"];
    const names = {
      expense: "Expense",
      income: "Income",
      loan: "Loan",
      credit: "Credit Payback"
    };

    $("categoryLists").innerHTML = types.map((type) => {
      const items = categoriesFor(type);
      return `
        <div class="category-block">
          <h3>${names[type]}</h3>
          <div class="chip-list">
            ${items.length ? items.map((item) => `<span class="chip">${esc(item.name)} <button data-remove-cat="${esc(item.name)}" data-type="${type}" class="remove-cat">×</button></span>`).join("") : "<span class='muted'>No categories</span>"}
          </div>
        </div>
      `;
    }).join("");

    document.querySelectorAll("[data-remove-cat]").forEach((button) => {
      button.addEventListener("click", () => {
        const name = button.dataset.removeCat;
        const type = button.dataset.type;
        state.categories = state.categories.filter((item) => !(item.name === name && item.type === type));
        save();
        render();
        toast("Category removed");
      });
    });
  }

  $("addCat").addEventListener("click", () => {
    const name = $("newCat").value.trim();
    const type = $("newCatType").value;

    if (!name) {
      toast("Enter a category name");
      return;
    }

    if (state.categories.some((c) => c.type === type && c.name.toLowerCase() === name.toLowerCase())) {
      toast("Category already exists");
      return;
    }

    state.categories.push({ name, type });
    $("newCat").value = "";
    save();
    render();
    toast("Category added");
  });

  $("exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "moneyflow-backup.json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Backup downloaded");
  });

  $("importFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const imported = JSON.parse(await file.text());
      if (!imported || !Array.isArray(imported.categories) || !Array.isArray(imported.transactions)) {
        throw new Error("Invalid backup file");
      }

      state = imported;
      save();
      render();
      toast("Backup imported");
    } catch (error) {
      console.warn("Import failed", error);
      toast("Import failed");
    }

    e.target.value = "";
  });

  let deferred = null;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event;
    $("installBtn").classList.remove("hidden");
  });

  $("installBtn").addEventListener("click", async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    $("installBtn").classList.add("hidden");
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(console.warn);
    });
  }

  loadRemoteToState();
  setFormType("expense");
  render();
})();
