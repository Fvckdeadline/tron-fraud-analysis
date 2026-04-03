const axios = require("axios");
const readline = require("readline-sync");
const fs = require("fs");

const API = "https://apilist.tronscanapi.com/api/token_trc20/transfers";
const SERVER_URL = "http://localhost:3050";
const RESULT_FILE = "data.json";
const DOT_FILE = "public/graph.dot";

function loadResult() {
    try {
        return JSON.parse(fs.readFileSync(RESULT_FILE));
    } catch {
        return { transactions: [], wallets: {} };
    }
}

const state = {
    visited: new Set(),
    result: loadResult(),
};
state.txIndex = new Map(state.result.transactions.map((tx) => [tx.txid, tx]));
state.routeIndex = new Map(
    state.result.transactions.map((tx) => [`${tx.from}->${tx.to}`, tx])
);

function saveGraph(highlightTxid = "") {
    fs.writeFileSync(RESULT_FILE, JSON.stringify(state.result, null, 2));
    fs.writeFileSync(DOT_FILE, toDOT(state.result.transactions, highlightTxid, state.result.wallets));
}

async function getTransfers(address, fullyChecked) {
    const limit = 50;
    let start = 0;
    const allTransfers = [];

    while (true) {
        const url = `${API}?limit=${limit}&start=${start}&contract_address=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t&relatedAddress=${address}`;
        try {
            const res = await axios.get(url);
            const transfers = res.data.token_transfers || [];
            allTransfers.push(...transfers);

            console.log(`getTransfers ${address}: received ${transfers.length} transactions (start=${start})`);

            if (transfers.length < limit) {
                fullyChecked = true;
                break; // конец данных
            }

            const continueFetch = readline.keyInYNStrict(`Continue fetching (start=${start + limit})? `);
            if (!continueFetch) {
                console.log('getTransfers: stopped by user.');
                break;
            }

            start += limit;
        } catch (error) {
            console.error("getTransfers error:", error.message);
            await new Promise((r) => setTimeout(r, 1000));
            // при ошибке пытаемся повторно той же страницы
        }
    }

    return { tfs: allTransfers, newFC: fullyChecked };
}

function normalize(tx) {
    return {
        txid: tx.transaction_id,
        from: tx.from_address,
        to: tx.to_address,
        amount: tx.quant / 1e6,
        time: new Date(tx.block_ts).toISOString(),
    };
}

function addTransaction(tx) {
    if (!state.txIndex.has(tx.txid)) {
        state.result.transactions.push(tx);
        state.txIndex.set(tx.txid, tx);
        state.routeIndex.set(`${tx.from}->${tx.to}`, tx);
    }
}

function computeFirstSeen(transactions) {
    const firstSeen = {};
    for (const tx of transactions) {
        if (!firstSeen[tx.from] || tx.time < firstSeen[tx.from]) firstSeen[tx.from] = tx.time;
        if (!firstSeen[tx.to] || tx.time < firstSeen[tx.to]) firstSeen[tx.to] = tx.time;
    }
    return firstSeen;
}

function toDOT(transactions, highlightTxid = "", wallets = {}, minAmount = 0) {
    let dot = "digraph G {\n rankdir=LR;\n ranksep=10.0;\n node [shape=box, style=filled];\n";
    const edges = new Map();
    const obtained = {}; // локально
    const minDate = new Date("2025-12-01T21:30:00.000");
    const minTotalForEdge = Number(minAmount) || 0;

    for (const tx of transactions) {
        if (new Date(tx.time) < minDate) continue;
        if (wallets[tx.from]?.type === "Attacker" && tx.amount <= 50 && !state.routeIndex.get(`${tx.to}->${tx.from}`)) continue;
        const key = `${tx.from}->${tx.to}`;
        if (!edges.has(key)) {
            edges.set(key, { from: tx.from, to: tx.to, total: 0, count: 0, highlight: false, firstTime: tx.time, lastTime: tx.time });
        }
        const e = edges.get(key);
        e.total += tx.amount;
        e.count += 1;
        if (new Date(tx.time) < new Date(e.firstTime)) e.firstTime = tx.time;
        if (new Date(tx.time) > new Date(e.lastTime)) e.lastTime = tx.time;
        if (tx.txid === highlightTxid) e.highlight = true;
        if (wallets[tx.from]?.type === "Victim" && wallets[tx.to]?.type === "Attacker") {
            obtained[tx.to] = (obtained[tx.to] || 0) + tx.amount;
        }
    }

    const firstSeen = computeFirstSeen(transactions);
    const colors = {
        Attacker: "#ff6b6b",
        Drop: "#ffa0a0",
        Cashout: "#33f1ff",
        Hub: "#f7b267",
        CryptoBot: "#a29bfe",
        Victim: "#74c0fc",
        Binance: "#d37000",
        Bybit: "#8d96b3",
        PersonalScammersWallet: "#e2de02",
        Bridge: "#2f5bd3",
        OKX: "#163f2b",
        Rapira: "#3385ff",
        FixedFloat: "#748a8b",
        Cryptomus: "#9eb4b6",
        Kraken: "#8d9db4",
        Gate: "#bdbdbd",
        Bitgate: "#bdbdbd",
        Mixer: "#ca8d95",
        WestWallet: "#f7b267",
        WhiteBit: "#f7b267",
        KuCoin: "#bfa6c0",
        MEXC: "#5f5994",
        Storage: "#fceb52",
        Huobi: "#526bfc",
        MarkedSuspicious: "#ff0000",
    };
    const exchanges = ["Binance", "Bybit", "OKX", "Huobi", "KuCoin", "Gate.io", "Bitfinex", "Kraken", "Bitstamp", "Rapira", "CryptoBot", "FixedFloat", "Cryptomus", "Kraken", "Gate", "Bitgate", "Bridge", "WestWallet", "WhiteBit", "MEXC"];
    // Для биржевых узлов (Binance/Bybit) создадим разные каждый вход/выход
    const nodes = new Map(); // nodeKey -> real node address
    const hubIncome = {};

    for (const e of edges.values()) {
        if (e.total < minTotalForEdge) continue;
        // if (e.amount < 100) continue; // фильтр мелких транзакций
        if (e.amount <= 50 && wallets[e.from]?.type === "Attacker" && !state.routeIndex.get(`${e.to}->${e.from}`)) continue; // фильтр мелких транзакций от атакера, если нет встречного перевода
        if (new Date(e.lastTime) < new Date("2025-12-01T21:30:00.000")) continue; // фильтр по дате

        const fromType = wallets[e.from]?.type;
        const toType = wallets[e.to]?.type;

        if (toType === "Hub") {
            hubIncome[e.to] = (hubIncome[e.to] || 0) + e.total;
        }

        const fromId = exchanges.includes(fromType) ? `${e.from}_out_${e.to}` : e.from;
        const toId = exchanges.includes(toType) ? `${e.to}_in_${e.from}` : e.to;

        nodes.set(fromId, e.from);
        nodes.set(toId, e.to);

        e.fromId = fromId;
        e.toId = toId;
    }

    for (const [nodeId, realNode] of nodes.entries()) {
        const type = wallets[realNode]?.type || "Unknown";
        const color = colors[type] || "#dddddd";
        const date = firstSeen[realNode] ? new Date(firstSeen[realNode]).toISOString().slice(0, 10) : "unknown";
        let label = `${realNode}\\n(${type})`;
        if (type === "Attacker" && obtained[realNode]) {
            label += `\\nobtained ${obtained[realNode]}`;
        }
        if (type === "Hub" && hubIncome[realNode]) {
            label += `\\nincome ${hubIncome[realNode].toFixed(2)} USDT`;
        }
        if (wallets[realNode]?.created) {
            // const createdDate = new Date(wallets[realNode].created).toISOString().slice(0, 10);
            label += `\\ncreated: ${wallets[realNode]?.created}`;
        }
        dot += `"${nodeId}" [label="${label}", fillcolor="${color}"];\n`;//URL="https://tronscan.org/#/address/${realNode}", 
    }

    for (const e of edges.values()) {
        if (e.amount <= 50 && wallets[e.from]?.type === "Attacker" && !state.routeIndex.get(`${e.to}->${e.from}`)) continue; // фильтр мелких транзакций от атакера, если нет встречного перевода
        // if (e.amount < 100) continue; // фильтр мелких транзакций
        if (e.total < minTotalForEdge) continue;
        if (new Date(e.lastTime) < new Date("2025-12-01T21:30:00.000")) continue; // фильтр по дате
        const fromNodeId = e.fromId || e.from;
        const toNodeId = e.toId || e.to;
        dot += `"${fromNodeId}" -> "${toNodeId}" [label="${e.total.toFixed(2)} USDT (${e.count}), last: ${new Date(e.lastTime).toLocaleString()}", color=${e.highlight ? "red" : "black"}, penwidth=${e.highlight ? 3 : 1}, URL="${SERVER_URL}/edge?from=${e.from}&to=${e.to}"];\n`;
    }

    dot += "}";
    return dot;
}

function toDOTVictimToCashout(transactions, highlightTxid = "", wallets = {}, minAmount = 0, { startSet = new Set(Object.keys(state.result.wallets)), finishSet = new Set(Object.keys(state.result.wallets)) } = {}) {
    const minDate = new Date("2025-12-01T21:30:00.000");
    const minTotalForEdge = Number(minAmount) || 0;

    const edges = new Map();
    const obtained = {};

    for (const tx of transactions) {
        if (new Date(tx.time) < minDate) continue;
        if (wallets[tx.from]?.type === "Attacker" && tx.amount <= 50 && !state.routeIndex.get(`${tx.to}->${tx.from}`)) continue;

        const key = `${tx.from}->${tx.to}`;
        if (!edges.has(key)) {
            edges.set(key, {
                from: tx.from,
                to: tx.to,
                total: 0,
                count: 0,
                firstTime: tx.time,
                lastTime: tx.time,
            });
        }

        const e = edges.get(key);
        e.total += tx.amount;
        e.count += 1;
        if (new Date(tx.time) < new Date(e.firstTime)) e.firstTime = tx.time;
        if (new Date(tx.time) > new Date(e.lastTime)) e.lastTime = tx.time;
        if (tx.txid === highlightTxid) e.highlight = true;
    }

    const filteredEdges = new Map();
    for (const [key, e] of edges.entries()) {
        if (e.total < minTotalForEdge) continue;
        if (new Date(e.lastTime) < minDate) continue;
        filteredEdges.set(key, e);
    }

    const incoming = new Map();
    const outgoing = new Map();
    const hubIncome = {};

    for (const e of filteredEdges.values()) {
        if (!incoming.has(e.to)) incoming.set(e.to, []);
        incoming.get(e.to).push(e);
        if (!outgoing.has(e.from)) outgoing.set(e.from, []);
        outgoing.get(e.from).push(e);
    }
    const importantExchanges = ["Bridge", "Binance", "Bybit", "OKX", "Huobi", "KuCoin", "Gate.io", "Bitfinex", "Kraken", "Bitstamp", "Cryptomus", "Kraken", "FixedFloat", "Gate", "Bitgate", "WestWallet", "WhiteBit", "MEXC", "CryptoBot"];

    // Жесткая фильтрация: оставляем только ребра на пути startSet -> finishSet.
    const edgeInPath = new Set();
    const nodeReachable = new Map();

    const markReachable = (node, visiting = new Set()) => {
        if (nodeReachable.has(node)) return nodeReachable.get(node);
        if (visiting.has(node)) {
            nodeReachable.set(node, false);
            return false;
        }
        visiting.add(node);

        let reachable = finishSet.has(node);
        for (const edge of outgoing.get(node) || []) {
            if (markReachable(edge.to, visiting)) {
                reachable = true;
                edgeInPath.add(`${edge.from}->${edge.to}`);
            }
        }

        visiting.delete(node);
        nodeReachable.set(node, reachable);
        return reachable;
    };

    for (const start of startSet) {
        markReachable(start);
    }

    const selectedEdges = new Set();
    const selectedNodes = new Set();

    for (const edgeKey of edgeInPath) {
        selectedEdges.add(edgeKey);
        const [from, to] = edgeKey.split('->');
        selectedNodes.add(from);
        selectedNodes.add(to);
    }

    // Добавим start/finish, чтобы даже без ходов они могли присутствовать (если это нужно)
    for (const start of startSet) {
        if (nodeReachable.get(start)) selectedNodes.add(start);
    }
    for (const finish of finishSet) {
        selectedNodes.add(finish);
    }

    const firstSeen = computeFirstSeen(transactions);

    const colors = {
        Attacker: "#ff6b6b",
        Drop: "#ffa0a0",
        Cashout: "#33f1ff",
        Hub: "#f7b267",
        CryptoBot: "#a29bfe",
        Victim: "#74c0fc",
        Binance: "#d37000",
        Bybit: "#8d96b3",
        PersonalScammersWallet: "#e2de02",
        Bridge: "#2f5bd3",
        OKX: "#163f2b",
        Rapira: "#3385ff",
        FixedFloat: "#748a8b",
        Cryptomus: "#9eb4b6",
        Kraken: "#8d9db4",
        Gate: "#bdbdbd",
        Bitgate: "#bdbdbd",
        Mixer: "#ca8d95",
        WestWallet: "#f7b267",
        WhiteBit: "#f7b267",
        KuCoin: "#bfa6c0",
        MEXC: "#5f5994",
        Storage: "#fceb52",
        Huobi: "#526bfc",
        MarkedSuspicious: "#ff0000",
    };

    let dot = "digraph G {\n rankdir=LR;\n ranksep=7.0;\n node [shape=box, style=filled];\n";

    const nodes = new Map();

    for (const key of selectedEdges) {
        const edge = edges.get(key);
        if (!edge) continue;

        const fromType = wallets[edge.from]?.type;
        const toType = wallets[edge.to]?.type;
        const fromId = importantExchanges.includes(fromType) ? `${edge.from}_out_${edge.to}` : edge.from;
        const toId = importantExchanges.includes(toType) ? `${edge.to}_in_${edge.from}` : edge.to;

        if (toType === "Hub") {
            hubIncome[edge.to] = (hubIncome[edge.to] || 0) + edge.total;
        }
        if (fromType === "Victim" && toType === "Attacker") {
            obtained[edge.to] = (obtained[edge.to] || 0) + edge.total;
        }

        nodes.set(fromId, edge.from);
        nodes.set(toId, edge.to);
    }

    // не добавляем изолированные узлы, оставляем только связанные через ребра
    for (const [nodeId, realNode] of nodes.entries()) {
        const type = wallets[realNode]?.type || "Unknown";
        const color = colors[type] || "#dddddd";
        const date = firstSeen[realNode] ? new Date(firstSeen[realNode]).toISOString().slice(0, 10) : "unknown";
        let label = `${realNode}\\n(${type})`; 
        if (type === "Attacker" && obtained[realNode]) {
            label += `\nobtained ${obtained[realNode].toFixed(2)}`;
        }        if (wallets[realNode]?.created) {
            label += `\\ncreated: ${wallets[realNode].created}`;
        }
        if (type === "Hub" && hubIncome[realNode]) {
            label += `\\nincome ${hubIncome[realNode].toFixed(2)} USDT`;
        }
        dot += `"${nodeId}" [label="${label}", fillcolor="${color}", URL="https://tronscan.org/#/address/${realNode}"];\n`;
    }

    for (const key of selectedEdges) {
        const edge = edges.get(key);
        if (!edge) continue;

        const fromType = wallets[edge.from]?.type;
        const toType = wallets[edge.to]?.type;
        const fromId = importantExchanges.includes(fromType) ? `${edge.from}_out_${edge.to}` : edge.from;
        const toId = importantExchanges.includes(toType) ? `${edge.to}_in_${edge.from}` : edge.to;
        const fromLabel = importantExchanges.includes(fromType) ? fromType : null;
        const toLabel = importantExchanges.includes(toType) ? toType : null;
        dot += `"${fromId}" -> "${toId}" [label="${edge.total.toFixed(2)} USDT (${edge.count}), last: ${new Date(edge.lastTime).toLocaleString()}", color=black, penwidth=1, URL="${SERVER_URL}/edge?from=${edge.from}&to=${edge.to}"];\n`;//
    }

    dot += "}";
    return dot;
}

async function trace(address, depth = 3) {
    if (depth <= 0 || state.visited.has(address)) return;
    state.visited.add(address);

    console.log(`\n🔍 Exploring wallet: ${address}\n`);
    let fullyChecked = false;
    const { tfs, newFC } = await getTransfers(address, fullyChecked);
    fullyChecked = newFC;
    const transfers = tfs.map(normalize);

    for (const tx of transfers) {
        console.log("-----------");
        console.log(`TX: ${tx.txid}`);
        console.log(`FROM: ${tx.from}`);
        console.log(`TO: ${tx.to}`);
        console.log(`AMOUNT: ${tx.amount} USDT`);
        console.log(`TIME: ${tx.time}`);
        console.log("-----------");

        if (state.txIndex.has(tx.txid)) {
            const again = readline.question("Trace tx again? - n / y: ");
            if (again.toLowerCase() === "n") continue;
        }

        addTransaction(tx);
        saveGraph(tx.txid);

        const action = readline.question("Where to go? (f = sender, t = receiver, n = skip, b = break): ").toLowerCase();

        if (action === "f") await trace(tx.from, depth - 1);
        else if (action === "t") await trace(tx.to, depth - 1);
        else if (action === "b") break;

        // fullyChecked = true;
    }

    const existingType = state.result.wallets[address]?.type || "";
    const typeAnswer = readline.question(`Wallet type ${address} (scam/hub/exchange) [current: ${existingType}] (enter to skip): `);
    state.result.wallets[address] = state.result.wallets[address] || {};
    if (typeAnswer.trim()) state.result.wallets[address].type = typeAnswer.trim();

    if (fullyChecked && transfers.length > 0) {
        const lastTx = transfers.reduce((max, tx) => (tx.time > max ? tx.time : max), transfers[0].time);
        state.result.wallets[address].created = lastTx;
    }

    saveGraph();
}


async function main() {
    saveGraph();

    const start = readline.question("Start address: ");
    const depth = parseInt(readline.question("Depth: "), 10) || 3;
    await trace(start, depth);
    saveGraph();
    console.log("\n✅ Saved to data.json and public/graph.dot");
}

if (require.main === module) {
    main();
}

module.exports = {
    toDOT,
    toDOTVictimToCashout,
};