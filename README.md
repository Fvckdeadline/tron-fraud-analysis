# 🚨 USDT Scam Network Investigation (TRON)

## Summary

This repository documents an on-chain investigation into a coordinated USDT scam network operating on the TRON blockchain.

- 💰 Total identified volume: **~$380,000**
- 🧠 Number of wallets: **17+**
- 🔁 ~98% of funds routed through CryptoBot
- 🔗 Multiple hubs and laundering patterns identified

---

## Scam Pattern

The attackers use a **refund manipulation scheme**:

1. Victim receives a small transaction (e.g. 2.096 USDT instead of $500)
2. Attacker claims a mistake
3. Requests a "refund"
4. Victim sends a significantly larger amount

---

## Fund Flow
<img width="8838" height="190" alt="firstReport" src="https://github.com/user-attachments/assets/7806cc15-e81b-4fb4-b4ce-cc9373f7ebb7" />

---

## Key Findings

- Centralized storage wallets aggregating funds
- Repeated routing patterns across multiple victims
- Strong reliance on CryptoBot as an entry/exit point
- Structured movement towards exchanges (off-ramping)

---

## Graph
<img width="20508" height="2875" alt="graph 2" src="https://github.com/user-attachments/assets/e418f283-cf1e-40bc-9a8a-374f4f71ad21" />

---

## Data

- Full dataset available in `/data`
- Includes:
  - transaction history
  - wallet classifications
  - labeled flows
 
---

## Methodology

- Recursive transaction tracing
- Manual classification (Attacker / Storage / Victim / Exchange)
- Graph-based clustering
- Flow aggregation

---

## Local Exploration Tool

This repository also includes a lightweight server for interactive analysis of transactions and wallet relationships.

You can explore:
- transaction flows
- wallet connections
- labeled routes
- quick navigation to blockchain explorer links

### Clone repository 
```bash
git clone https://github.com/Fvckdeadline/tron-fraud-analysis.git
```

### Install Node modules
```bash
npm install
```

### Run locally
```bash
node server.js
```
Then open in your browser:

http://localhost:3050

This interface allows convenient investigation of the dataset and visual graph navigation.

---

## Disclaimer

This analysis is based on publicly available blockchain data and reflects observed transaction patterns. No claims are made regarding the identity of individuals behind the addresses.

---

## Contact

If you are part of a compliance or investigation team, I am open to sharing the full dataset and analysis.

