// Trust402 assessment engine: real on-chain + web signals, no API keys.
const IDX = "https://mainnet-idx.algonode.cloud";
const USDC = 31566704;

type Check = {
  name: string;
  status: "pass" | "warn" | "fail" | "info";
  detail: string;
  weight: number;
};

const ok = (name: string, detail: string, weight = 6): Check => ({ name, status: "pass", detail, weight });
const warn = (name: string, detail: string, weight = 6): Check => ({ name, status: "warn", detail, weight });
const bad = (name: string, detail: string, weight = 10): Check => ({ name, status: "fail", detail, weight });
const info = (name: string, detail: string): Check => ({ name, status: "info", detail, weight: 0 });

async function getJson(url: string, init: RequestInit = {}, ms = 6000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { ...init, signal: c.signal });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function headStatus(url: string) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 5000);
  try {
    return (await fetch(url, { redirect: "manual", signal: c.signal })).status;
  } catch {
    return 0;
  } finally {
    clearTimeout(t);
  }
}

const isAddr = (s: string) => /^[A-Z2-7]{58}$/.test(s);
const days = (ts: number) => Math.floor((Date.now() / 1000 - ts) / 86400);

/* ---------------- WALLET ---------------- */

async function walletChecks(addr: string, deep = false): Promise<{ checks: Check[]; nfd: string | null }> {
  const checks: Check[] = [];
  const [accRes, txRes, nfdRes] = await Promise.all([
    getJson(`${IDX}/v2/accounts/${addr}`),
    getJson(`${IDX}/v2/accounts/${addr}/transactions?limit=${deep ? 100 : 25}`),
    getJson(`https://api.nf.domains/nfd/lookup?address=${addr}&view=tiny`),
  ]);

  const acc = accRes?.account;
  if (!acc) {
    checks.push(bad("Account exists", "No on-chain account found. It was never funded.", 25));
    return { checks, nfd: null };
  }

  const algo = (acc.amount ?? 0) / 1e6;
  checks.push(
    algo >= 5 ? ok("ALGO balance", `${algo.toFixed(2)} ALGO held.`)
    : algo >= 0.5 ? info("ALGO balance", `${algo.toFixed(2)} ALGO held.`)
    : warn("ALGO balance", `Only ${algo.toFixed(3)} ALGO. Little balance behind this account.`, 5),
  );

  const round = acc["created-at-round"];
  if (round) {
    const b = await getJson(`${IDX}/v2/blocks/${round}?header-only=true`);
    if (b?.timestamp) {
      const d = days(b.timestamp);
      checks.push(
        d >= 365 ? ok("Account age", `About ${d} days old.`, 10)
        : d >= 30 ? info("Account age", `About ${d} days old.`)
        : warn("Account age", `Very new account (${d} days old).`, 10),
      );
    }
  }

  const list: any[] = txRes?.transactions ?? [];
  if (list.length === 0) {
    checks.push(warn("Activity", "No transactions found for this account.", 8));
  } else {
    const last = Math.max(...list.map((t) => t["round-time"] ?? 0));
    const d = last ? days(last) : null;
    checks.push(
      d !== null && d <= 30 ? ok("Recent activity", `Last transaction ${d} day(s) ago.`, 8)
      : warn("Recent activity", `Last transaction about ${d} days ago. Dormant.`, 6),
    );
  }

  if (acc["auth-addr"]) {
    checks.push(warn("Rekeyed account", "Spending is controlled by a different key (rekeyed).", 8));
  } else {
    checks.push(ok("Key control", "Account is not rekeyed.", 4));
  }

  const usdc = (acc.assets ?? []).some((a: any) => a["asset-id"] === USDC);
  checks.push(
    usdc ? ok("USDC ready", "Opted in to USDC. Can receive payments.", 3)
    : info("USDC ready", "Not opted in to USDC."),
  );

  const nfdEntry = nfdRes ? (Object.values(nfdRes)[0] as any) : null;
  const nfd = nfdEntry?.name ?? null;
  checks.push(
    nfd ? ok("NFD identity", `Linked to ${nfd}.`, 10)
    : info("NFD identity", "No NFD name linked to this address."),
  );

  if (deep) {
    const nowS = Date.now() / 1000;
    let inn = 0, out = 0, w7 = 0, w30 = 0;
    const peers = new Set<string>();
    for (const t of list) {
      const a = t["asset-transfer-transaction"] ?? t["payment-transaction"];
      if (t.sender === addr) { out++; if (a?.receiver) peers.add(a.receiver); }
      else { inn++; peers.add(t.sender); }
      const age = nowS - (t["round-time"] ?? 0);
      if (age <= 7 * 86400) w7++;
      if (age <= 30 * 86400) w30++;
    }
    if (list.length) {
      checks.push(info("Flow pattern", `Last ${list.length} txns: ${inn} incoming, ${out} outgoing.`));
      checks.push(
        peers.size >= 5 ? ok("Counterparty diversity", `${peers.size} distinct counterparties.`, 6)
        : warn("Counterparty diversity", `Only ${peers.size} distinct counterparties.`, 6),
      );
      checks.push(info("Velocity", `${w7} txns in 7 days, ${w30} in 30 days.`));
      if (w7 > 60) checks.push(warn("Velocity", "Very high transaction rate. Possible automated activity.", 6));
    }
    checks.push(info("Holdings", `${acc["total-assets-opted-in"] ?? 0} assets and ${acc["total-apps-opted-in"] ?? 0} apps opted in.`));
    const made = acc["total-created-assets"] ?? 0;
    checks.push(info("Asset issuer", made > 0 ? `Created ${made} asset(s).` : "Has not created assets."));
    const u = (acc.assets ?? []).find((a: any) => a["asset-id"] === USDC);
    if (u) checks.push(info("USDC balance", `${(u.amount / 1e6).toFixed(2)} USDC held.`));
  }

  return { checks, nfd };
}

/* ---------------- WEBSITE / x402 ENDPOINT ---------------- */

function safeUrl(input: string): URL | null {
  try {
    const u = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    const h = u.hostname.toLowerCase();
    if (!h.includes(".") || h === "localhost") return null;
    if (/^[\d.]+$/.test(h) || h.includes(":") || h.startsWith("[")) return null;
    if (/\.(local|internal|localhost|lan|home)$/.test(h)) return null;
    return u;
  } catch {
    return null;
  }
}

async function siteChecks(u: URL, deep = false): Promise<{ checks: Check[]; payTo: string | null }> {
  const checks: Check[] = [];
  let payTo: string | null = null;

  checks.push(
    u.protocol === "https:" ? ok("HTTPS", "Served over HTTPS.", 8)
    : bad("HTTPS", "Not using HTTPS.", 12),
  );

  const host = u.hostname.split(".").slice(-2).join(".");
  const rdap = await getJson(`https://rdap.org/domain/${host}`, {}, 7000);
  const reg = (rdap?.events ?? []).find((e: any) => e.eventAction === "registration");
  if (reg?.eventDate) {
    const d = days(Date.parse(reg.eventDate) / 1000);
    checks.push(
      d >= 365 ? ok("Domain age", `Registered about ${d} days ago.`, 10)
      : d >= 30 ? info("Domain age", `Registered about ${d} days ago.`)
      : warn("Domain age", `Very new domain (${d} days).`, 12),
    );
  } else {
    checks.push(info("Domain age", "Registration date not available."));
  }

  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 7000);
  try {
    const url = u.toString();
    let r = await fetch(url, { redirect: "manual", signal: c.signal });
    if (r.status === 405 || r.status === 404) {
      r = await fetch(url, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" }, redirect: "manual", signal: c.signal });
    }

    if (r.status >= 500) checks.push(warn("Reachability", `Server error (HTTP ${r.status}).`, 8));
    else checks.push(ok("Reachability", `Responded with HTTP ${r.status}.`, 6));

    if (r.status === 402) {
      checks.push(ok("x402 endpoint", "Returns HTTP 402 Payment Required (a paid x402 endpoint).", 8));
      const h = r.headers.get("payment-required");
      if (h) {
        try {
          const pr = JSON.parse(atob(h));
          const a = pr.accepts?.[0];
          if (a) {
            const price = a.amount ? (Number(a.amount) / 1e6).toFixed(3) : "?";
            checks.push(info("x402 terms", `${price} USDC on ${String(a.network).slice(0, 18)}…`));
            if (a.payTo && isAddr(a.payTo)) payTo = a.payTo;
            if (Number(a.amount) > 1_000_000) checks.push(warn("Price", "Asks more than 1 USDC per call.", 8));
          }
        } catch { /* ignore */ }
      }
    }

    const hd = r.headers;
    const hardening = ["strict-transport-security", "content-security-policy", "x-content-type-options"].filter((k) => hd.has(k));
    checks.push(
      hardening.length >= 2 ? ok("Security headers", `${hardening.length}/3 hardening headers present.`, 5)
      : info("Security headers", `${hardening.length}/3 hardening headers present.`),
    );

    if (r.status >= 300 && r.status < 400) {
      checks.push(info("Redirect", `Redirects to ${hd.get("location")?.slice(0, 80) ?? "another URL"}.`));
    }
  } catch {
    checks.push(bad("Reachability", "Could not reach the target within 7 seconds.", 14));
  } finally {
    clearTimeout(t);
  }

  if (deep) {
    const exp = (rdap?.events ?? []).find((e: any) => e.eventAction === "expiration");
    if (exp?.eventDate) {
      const left = -days(Date.parse(exp.eventDate) / 1000);
      checks.push(
        left < 60 ? warn("Domain expiry", `Domain expires in ${left} days.`, 6)
        : ok("Domain expiry", `Domain expires in ${left} days.`, 3),
      );
    }
    const [sec, rob] = await Promise.all([
      headStatus(`${u.origin}/.well-known/security.txt`),
      headStatus(`${u.origin}/robots.txt`),
    ]);
    checks.push(sec === 200 ? ok("security.txt", "Publishes a security contact.", 4) : info("security.txt", "No security.txt found."));
    checks.push(info("robots.txt", rob === 200 ? "robots.txt present." : "No robots.txt."));
  }

  return { checks, payTo };
}

/* ---------------- MAIN ---------------- */

export async function assess(target: string | null, deep = false) {
  const raw = (target ?? "").trim().slice(0, 200);
  let type = "label";
  const checks: Check[] = [];
  let nfd: string | null = null;
  let subject: string | null = null;

  if (isAddr(raw)) {
    type = "algorand_address";
    const w = await walletChecks(raw, deep);
    checks.push(...w.checks);
    nfd = w.nfd;
  } else if (/\.algo$/i.test(raw)) {
    type = "nfd_name";
    const d = await getJson(`https://api.nf.domains/nfd/${raw.toLowerCase()}?view=brief`);
    const owner = d?.owner;
    if (owner && isAddr(owner)) {
      nfd = raw.toLowerCase();
      checks.push(ok("NFD resolves", `${nfd} resolves to ${owner.slice(0, 6)}…${owner.slice(-6)}.`, 8));
      checks.push(...(await walletChecks(owner, deep)).checks);
      subject = owner;
    } else {
      checks.push(bad("NFD resolves", "This NFD name does not resolve to an owner.", 15));
    }
  } else if (safeUrl(raw)) {
    type = "website_or_api";
    const u = safeUrl(raw)!;
    const s = await siteChecks(u, deep);
    checks.push(...s.checks);
    if (s.payTo) {
      checks.push(info("Receiving wallet", `Endpoint pays to ${s.payTo.slice(0, 6)}…${s.payTo.slice(-6)}. Checked below.`));
      const w = await walletChecks(s.payTo, deep);
      checks.push(...w.checks.map((c) => ({ ...c, name: `payTo · ${c.name}` })));
      nfd = w.nfd;
      subject = s.payTo;
    }
  }

  const real = checks.filter((c) => c.status !== "info").length;
  let score = 50;
  for (const c of checks) {
    if (c.status === "pass") score += c.weight;
    else if (c.status === "fail") score -= c.weight;
    else if (c.status === "warn") score -= Math.round(c.weight / 2);
  }
  score = Math.max(1, Math.min(99, score));
  if (type === "label") score = 50;

  const risk = score >= 75 ? "low" : score >= 50 ? "medium" : "high";
  const confidence = type === "label" ? 0.2 : Math.min(0.95, +(0.25 + real * 0.09).toFixed(2));

  const warnings = checks.filter((c) => c.status === "fail" || c.status === "warn").map((c) => `${c.name}: ${c.detail}`);
  if (type === "label") {
    warnings.push("Unrecognized target. Send an Algorand address, .algo name or https:// URL for real checks.");
  }

  const has = (n: string, s: string) => checks.some((c) => c.name.endsWith(n) && c.status === s);

  return {
    trust_score: score,
    risk_level: risk,
    target: raw || null,
    target_type: type,
    tier: deep ? "advanced" : "basic",
    resolved_wallet: subject,
    identity: { status: nfd ? `nfd:${nfd}` : "unverified", checked: type !== "label" },
    wallet: { status: type === "label" ? "not_applicable" : has("Account exists", "fail") ? "unfunded" : "analyzed", checked: type !== "label" },
    reputation: { status: real >= 4 ? "assessed" : "limited_data", checked: real > 0 },
    contract: { status: "not_analyzed", checked: false },
    website: { status: type === "website_or_api" ? "analyzed" : "not_applicable", checked: type === "website_or_api" },
    checks,
    warnings,
    evidence: checks.filter((c) => c.status === "pass" || c.status === "info").map((c) => ({ type: c.name, description: c.detail })),
    confidence,
    payment: { price: deep ? "$0.20" : "$0.05", network: "Algorand MainNet", asset: "USDC" },
    timestamp: new Date().toISOString(),
    service: "Trust402",
    version: "0.2.0",
  };
}
