const express = require("express");
const app = express();
const fs = require("fs");
const path = require("path");
const { toDOT, toDOTVictimToCashout } = require("./index");

// если приложение за nginx/proxy, тогда пробрасываем реальный IP из заголовков
app.set("trust proxy", true);

// логирование входящих запросов с IP и URI
app.use((req, res, next) => {
    const clientIp = req.ip || req.socket.remoteAddress;
    console.log(new Date().toISOString(), "IP:", clientIp, "METHOD:", req.method, "URL:", req.originalUrl);
    next();
});

app.get("/data", async (req, res) => {
    const result = JSON.parse(fs.readFileSync("result.json"));
    res.json(result);
});

app.get("/graph.dot", async (req, res) => {
    const minAmount = Number(req.query.min) || 0;
    const result = JSON.parse(fs.readFileSync("result.json"));
    // const firstReport = JSON.parse(fs.readFileSync("firstReport.json"));
    
    const importantExchanges = ["Binance", "Bybit", "OKX", "Huobi", "KuCoin", "Gate.io", "Bitfinex", "Kraken", "Bitstamp", "Cryptomus", "Kraken", "FixedFloat", "Gate", "Bitgate", "WestWallet", "WhiteBit", "MEXC", "CryptoBot"];

    const finishSet = new Set(Object.entries(result.wallets).filter(([, w]) => importantExchanges.includes(w.type)).map(([addr]) => addr));
    const startSet = new Set(Object.entries(result.wallets).filter(([, w]) => w.type === "Victim").map(([addr]) => addr));

    // const startSet = new Set(Object.entries(result.wallets).filter(([_, w]) => _ === "TJqwA7SoZnERE4zW5uDEiPkbz4B66h9TFj_VictimBinance").map(([addr]) => addr));
    // const finishSet = new Set(Object.entries(result.wallets).filter(([_, w]) => _ === "TU4vEruvZwLLkSfV9bNw12EJTPvNr7Pvaa").map(([addr]) => addr));
    let txs = result.transactions;

    // txs = findMaxAmountPath("TU4vEruvZwLLkSfV9bNw12EJTPvNr7Pvaa_VictimBybit", "TDqSquXBgUCLYvYC4XZgrprLK589dkhSCf", result.transactions)
    const dot = toDOTVictimToCashout(txs, "", result.wallets, minAmount, {startSet, finishSet});
    res.type("text/vnd.graphviz").send(dot);
});

function findMaxAmountPath(from, to, transactions) {
    const outgoing = new Map();
    for (const tx of transactions) {
        if (!outgoing.has(tx.from)) outgoing.set(tx.from, []);
        outgoing.get(tx.from).push(tx);
    }

    const memo = new Map(); // node -> {sum, path}
    const inStack = new Set(); // чтобы не зациклиться

    function dfs(node) {
        if (node === to) return { sum: 0, path: [] };
        if (memo.has(node)) return memo.get(node);
        if (inStack.has(node)) return { sum: Infinity, path: [] };

        inStack.add(node);

        let best = { sum: Infinity, path: [] };
        for (const tx of outgoing.get(node) || []) {
            const next = tx.to;
            const sub = dfs(next);
            if (sub.sum === Infinity) continue;

            const candidateSum = tx.amount + sub.sum;
            if (candidateSum < best.sum) {
                best = { sum: candidateSum, path: [tx, ...sub.path] };
            }
        }

        inStack.delete(node);
        // если не нашел не одного пути, помечаем как -Infinity
        memo.set(node, best);
        return best;
    }

    const result = dfs(from);
    if (result.sum === -Infinity) {
        return { path: [], totalAmount: 0 };
    }
    return result.path;
}
app.use(express.static("public"));

app.listen(3050, async () => {
    console.log("http://localhost:3050");
});

app.get("/edge", (req, res) => {
    const { from, to } = req.query;
    const result = JSON.parse(fs.readFileSync("result.json"));

    const txs = result.transactions.filter(
        tx => tx.from === from && tx.to === to
    ).map(tx => {
        tx.tronscan = "https://tronscan.org/#/transaction/" + tx.txid;
        return tx;
    });

    res.json(txs);
});

app.get("/stats", (req, res) => {
    const result = JSON.parse(fs.readFileSync("result.json"));
    const wallets = result.wallets || {};

    let totalObtainedByAttackers = 0;
    let totalCashedOut = 0;
    let goneToCryptoBot = 0;

    for (const tx of result.transactions || []) {
        const fromType = wallets[tx.from]?.type;
        const toType = wallets[tx.to]?.type;

        if (fromType === "Victim" && toType === "Attacker") {
            totalObtainedByAttackers += Number(tx.amount || 0);
        }

        if (toType === "Cashout") {
            totalCashedOut += Number(tx.amount || 0);
        }
        if (toType === "CryptoBot") {
            goneToCryptoBot += Number(tx.amount || 0);
        }
    }

    res.json({ totalObtainedByAttackers, totalCashedOut, goneToCryptoBot });
});