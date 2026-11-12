
/* BTC Multi-Exchange Pressure: Coinbase + Kraken */
(() => {
  "use strict";

  if (window.__btcMultiFlowLoaded) return;
  window.__btcMultiFlowLoaded = true;

  const host =
    document.querySelector(".panel:nth-child(2)") ||
    document.querySelector(".wrap") ||
    document.body;

  const section = document.createElement("section");
  section.id = "multi-flow";
  section.style.cssText =
    "margin-top:10px;padding:10px;background:#202d3e;" +
    "border:1px solid #35445b;border-radius:9px;" +
    "font-size:12px;color:#e8eef7";

  section.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:6px">
      <b>AGGR-STYLE · MULTI-EXCHANGE</b>
      <span id="mf-status" style="color:#f3c65c">Connecting…</span>
    </div>

    <div style="color:#9baac0;font-size:10px;margin:5px 0">
      Coinbase + Kraken · BTC/USD · 2-minute pressure
    </div>

    <div style="height:9px;background:#d64c62;border-radius:8px;overflow:hidden;margin:8px 0">
      <div id="mf-bar" style="background:#25ba86;width:50%;height:100%"></div>
    </div>

    <div style="display:flex;justify-content:space-between">
      <b id="mf-buy" style="color:#35d39a">BUY —</b>
      <b id="mf-sell" style="color:#ff7787">SELL —</b>
    </div>

    <div style="display:flex;justify-content:space-between;margin-top:8px">
      <span>Whales $100K+ / 5m</span>
      <b id="mf-100">—</b>
    </div>

    <div style="display:flex;justify-content:space-between;margin-top:5px">
      <span>Whales $500K+ / 5m</span>
      <b id="mf-500">—</b>
    </div>

    <div style="display:flex;justify-content:space-between;margin-top:5px">
      <span>Pressure shift</span>
      <b id="mf-shift">Collecting…</b>
    </div>

    <div style="color:#9baac0;font-size:10px;margin-top:7px">
      Live while open · independent exchange feeds
    </div>
  `;

  host.appendChild(section);

  const el = id => document.getElementById(id);
  const events = [];
  const online = { Coinbase: false, Kraken: false };
  const lastSeen = { Coinbase: 0, Kraken: 0 };

  function add(exchange, side, price, qty) {
    const p = Number(price);
    const q = Number(qty);

    if (!Number.isFinite(p) || !Number.isFinite(q) ||
        p <= 0 || q <= 0 ||
        !["buy", "sell"].includes(side)) return;

    const t = Date.now();
    events.push({ t, exchange, side, usd: p * q });
    lastSeen[exchange] = t;

    if (events.length > 30000) {
      events.splice(0, events.length - 30000);
    }
  }

  function connect(name, url, subscribe, parse) {
    let socket;

    function open() {
      socket = new WebSocket(url);

      socket.onopen = () => {
        online[name] = true;
        socket.send(JSON.stringify(subscribe));
      };

      socket.onmessage = event => {
        try {
          parse(JSON.parse(event.data));
        } catch (_) {}
      };

      socket.onclose = () => {
        online[name] = false;
        setTimeout(open, 4000);
      };

      socket.onerror = () => {
        try { socket.close(); } catch (_) {}
      };
    }

    open();
  }

  connect(
    "Coinbase",
    "wss://ws-feed.exchange.coinbase.com",
    {
      type: "subscribe",
      product_ids: ["BTC-USD"],
      channels: ["matches"]
    },
    x => {
      if (x.type !== "match" &&
          x.type !== "last_match") return;

      // Coinbase trade side is the resting order side.
      const side = x.side === "sell" ? "buy" : "sell";
      add("Coinbase", side, x.price, x.size);
    }
  );

  connect(
    "Kraken",
    "wss://ws.kraken.com/v2",
    {
      method: "subscribe",
      params: {
        channel: "trade",
        symbol: ["BTC/USD"],
        snapshot: false
      }
    },
    x => {
      if (x.channel !== "trade" ||
          x.type !== "update" ||
          !Array.isArray(x.data)) return;

      for (const trade of x.data) {
        if (trade.symbol === "BTC/USD") {
          add("Kraken", trade.side, trade.price, trade.qty);
        }
      }
    }
  );

  function render() {
    const now = Date.now();

    while (events.length &&
           events[0].t < now - 300000) {
      events.shift();
    }

    const active = Object.keys(online).filter(
      name => online[name] &&
              now - lastSeen[name] < 20000
    );

    el("mf-status").textContent = active.length
      ? active.join(" + ") + " LIVE"
      : "Waiting for trades";

    el("mf-status").style.color =
      active.length === 2 ? "#35d39a" : "#f3c65c";

    const recent = events.filter(
      x => x.t >= now - 120000 &&
           active.includes(x.exchange)
    );

    let buy = 0;
    let sell = 0;

    for (const x of recent) {
      if (x.side === "buy") buy += x.usd;
      else sell += x.usd;
    }

    if (buy + sell > 0) {
      const pct = Math.round(100 * buy / (buy + sell));

      el("mf-bar").style.width = pct + "%";
      el("mf-buy").textContent = "BUY " + pct + "%";
      el("mf-sell").textContent =
        "SELL " + (100 - pct) + "%";

      const shift = el("mf-shift");

      shift.textContent =
        pct >= 60 ? "BUYERS DOMINANT" :
        pct <= 40 ? "SELLERS DOMINANT" :
        "MIXED";

      shift.style.color =
        pct >= 60 ? "#35d39a" :
        pct <= 40 ? "#ff7787" :
        "#a7b4c8";
    } else {
      el("mf-bar").style.width = "50%";
      el("mf-buy").textContent = "BUY —";
      el("mf-sell").textContent = "SELL —";
      el("mf-shift").textContent = "Collecting…";
    }

    const large = events.filter(
      x => active.includes(x.exchange)
    );

    for (const [id, threshold] of [
      ["mf-100", 100000],
      ["mf-500", 500000]
    ]) {
      const found = large.filter(x => x.usd >= threshold);
      const b = found.filter(x => x.side === "buy").length;

      el(id).textContent =
        found.length + " (" + b + " buy / " +
        (found.length - b) + " sell)";
    }
  }

  setInterval(render, 1500);
  render();
})();

