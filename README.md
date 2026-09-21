# MoneyFlow Personal Finance PWA

Modern mobile-first PWA for personal finance tracking.

## Calculation logic

**Income - Expenses - Loan Payments - Credit Paybacks = Remaining Money**

Savings rate:

**Remaining Money / Income × 100**

## Transaction types

- Expense: reduces remaining money
- Income: increases remaining money
- Loan: reduces remaining money
- Credit Payback: reduces remaining money

Categories are configurable in Settings and every category is assigned to one of those four calculation types.

## Features

- Modern dashboard landing page
- Quick-add expense/income/loan/credit buttons
- Monthly dashboard
- Category spending breakdown
- Transaction history
- Add/delete categories
- Category-to-calculation-type mapping
- JSON backup export/import
- Offline PWA
- Installable on Android
- Local browser storage

## GitHub Pages

Upload the complete project to a GitHub repository, then:

Settings → Pages → Deploy from branch → main → / (root)

Open the resulting HTTPS URL on Android Chrome and choose Install.

## Data

This version stores financial data locally in the browser. It does not connect to banks or transmit financial data to a server.

For multi-device synchronization, the next version can use Google Sheets, Supabase/Firebase, or a private API.
