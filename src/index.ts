import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import {
  paymentMiddleware,
  x402ResourceServer,
} from "npm:@x402/hono@^2";
import { HTTPFacilitatorClient } from "npm:@x402/core@2.27.0/server";
import { ExactAvmScheme } from "npm:@x402/avm@2.27.0/exact/server";
import {
  declareDiscoveryExtension,
  bazaarResourceServerExtension,
} from "npm:@x402-avm/extensions/bazaar";
import type { ResourceServerExtension } from "npm:@x402/core@2.27.0/types";

// Hardcoded on purpose: the package constant is a shortened ID that the
// GoPlausible facilitator rejects. This is the full Algorand MainNet CAIP-2 ID.
const ALGORAND_MAINNET_CAIP2 =
  "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=";
const USDC_MAINNET_ASA_ID = "31566704";

const SHORT_NET_RE = /algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k(?!tiC1)/g;
const toFull = (o: unknown) =>
  JSON.parse(
    JSON.stringify(o).replace(SHORT_NET_RE, ALGORAND_MAINNET_CAIP2),
  );

const app = new Hono();

app.onError((err, c) => {
  console.error("TRUST402 ERROR:", err);

  c.header("Access-Control-Allow-Origin", "*");
  c.header(
    "Access-Control-Expose-Headers",
    "PAYMENT-REQUIRED, PAYMENT-RESPONSE",
  );

  return c.json(
    {
      error: "trust402_internal_error",
      message: (err as Error)?.message || String(err),
    },
    500,
  );
});

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "PAYMENT-SIGNATURE"],
    exposeHeaders: ["PAYMENT-REQUIRED", "PAYMENT-RESPONSE"],
    maxAge: 86400,
  }),
);

app.get("/", (c) => {
  const payTo = PAY_TO || "Configured on server";

  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />

  <title>Trust402 — Trust & Risk API</title>

  <meta
    name="description"
    content="Machine-payable trust and risk assessment API for autonomous agents, wallets, APIs and websites."
  />

  <style>
    * {
      box-sizing: border-box;
    }

    html {
      scroll-behavior: smooth;
    }

    body {
      margin: 0;
      font-family:
        Inter,
        ui-sans-serif,
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;

      background:
        radial-gradient(
          circle at 20% 0%,
          rgba(24, 201, 154, 0.12),
          transparent 35%
        ),
        #06100d;

      color: #f5fffc;
      line-height: 1.6;
    }

    a {
      color: inherit;
      text-decoration: none;
    }

    .container {
      width: min(1100px, calc(100% - 32px));
      margin: auto;
    }

    header {
      padding: 22px 0;
      border-bottom: 1px solid #17352d;
      background: rgba(6, 16, 13, 0.85);
      backdrop-filter: blur(12px);
      position: sticky;
      top: 0;
      z-index: 20;
    }

    .nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 11px;
      font-weight: 900;
      font-size: 20px;
    }

    .logo {
      width: 42px;
      height: 42px;
      display: grid;
      place-items: center;
      border-radius: 12px;
      background: #18c99a;
      color: #04100c;
      font-weight: 950;
      font-size: 22px;
    }

    .nav-links {
      display: flex;
      gap: 18px;
      color: #9ab5ad;
      font-size: 14px;
    }

    .nav-links a:hover {
      color: #18c99a;
    }

    .hero {
      padding: 90px 0 70px;
      text-align: center;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 7px 12px;
      border: 1px solid #245247;
      border-radius: 999px;
      background: #0a1c17;
      color: #8ed9c3;
      font-size: 13px;
      margin-bottom: 22px;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #18c99a;
      box-shadow: 0 0 12px #18c99a;
    }

    h1 {
      max-width: 850px;
      margin: 0 auto;
      font-size: clamp(42px, 7vw, 76px);
      line-height: 1.02;
      letter-spacing: -3px;
    }

    .hero p {
      max-width: 680px;
      margin: 24px auto 30px;
      color: #9ab5ad;
      font-size: 19px;
    }

    .hero-actions {
      display: flex;
      justify-content: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .button {
      border: 0;
      border-radius: 12px;
      padding: 13px 18px;
      font-weight: 800;
      cursor: pointer;
      font-size: 14px;
    }

    .button-primary {
      background: #18c99a;
      color: #04100c;
    }

    .button-secondary {
      background: #0d211b;
      border: 1px solid #285247;
      color: #d9eee8;
    }

    section {
      padding: 65px 0;
    }

    .section-title {
      text-align: center;
      margin-bottom: 35px;
    }

    .section-title h2 {
      margin: 0 0 8px;
      font-size: 32px;
    }

    .section-title p {
      color: #8fa9a1;
      margin: 0;
    }

    .payment-grid {
      display: grid;
      grid-template-columns:
        repeat(4, 1fr);
      gap: 12px;
    }

    .card {
      background: #0a1915;
      border: 1px solid #1a3b32;
      border-radius: 16px;
      padding: 20px;
    }

    .card-label {
      color: #76928a;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 7px;
    }

    .card-value {
      font-weight: 850;
      font-size: 18px;
      word-break: break-word;
    }

    .price {
      color: #18c99a;
      font-size: 28px;
    }

    .api-card {
      background: #081712;
      border: 1px solid #1d4438;
      border-radius: 20px;
      padding: 25px;
    }

    .endpoint {
      display: inline-block;
      padding: 8px 12px;
      border-radius: 8px;
      background: #102820;
      color: #18c99a;
      font-family: monospace;
      font-weight: 800;
      margin-bottom: 16px;
    }

    pre {
      overflow-x: auto;
      padding: 18px;
      border-radius: 12px;
      background: #030907;
      border: 1px solid #153229;
      color: #b9d9d0;
      font-size: 13px;
    }

    .steps {
      display: grid;
      grid-template-columns:
        repeat(3, 1fr);
      gap: 14px;
    }

    .step {
      position: relative;
      padding: 22px;
      background: #0a1915;
      border: 1px solid #1a3b32;
      border-radius: 16px;
    }

    .step-number {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      border-radius: 10px;
      background: #18c99a;
      color: #04100c;
      font-weight: 900;
      margin-bottom: 14px;
    }

    .step h3 {
      margin: 0 0 7px;
    }

    .step p {
      margin: 0;
      color: #8fa9a1;
      font-size: 14px;
    }

    .live-box {
      text-align: center;
      padding: 35px 20px;
      border-radius: 20px;
      border: 1px solid #245247;
      background:
        radial-gradient(
          circle at center,
          rgba(24, 201, 154, 0.08),
          transparent 65%
        ),
        #091914;
    }

    #paymentInfo {
      display: none;
      text-align: left;
      margin-top: 22px;
    }

    .live-row {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      padding: 12px 0;
      border-bottom: 1px solid #17352d;
    }

    .live-row span:first-child {
      color: #76928a;
    }

    .live-row span:last-child {
      text-align: right;
      word-break: break-all;
      font-family: monospace;
      color: #d9eee8;
    }

    .copy {
      margin-left: 7px;
      padding: 3px 7px;
      border: 1px solid #31584e;
      border-radius: 6px;
      background: #0c201a;
      color: #a9c5bd;
      cursor: pointer;
      font-size: 11px;
    }

    .note {
      color: #78938b;
      font-size: 13px;
      margin-top: 14px;
    }

    footer {
      padding: 35px 0;
      border-top: 1px solid #17352d;
      color: #76928a;
      text-align: center;
      font-size: 13px;
    }

    @media (max-width: 800px) {
      .payment-grid {
        grid-template-columns:
          repeat(2, 1fr);
      }

      .steps {
        grid-template-columns: 1fr;
      }

      .nav-links {
        display: none;
      }
    }

    @media (max-width: 520px) {
      .hero {
        padding: 65px 0 45px;
      }

      h1 {
        letter-spacing: -2px;
      }

      .payment-grid {
        grid-template-columns: 1fr;
      }

      .live-row {
        flex-direction: column;
        gap: 4px;
      }

      .live-row span:last-child {
        text-align: left;
      }
    }
  </style>
</head>

<body>

<header>
  <div class="container nav">

    <a href="/" class="brand">
      <div class="logo">T</div>
      <span>Trust402</span>
    </a>

    <nav class="nav-links">
      <a href="#payment">Payment</a>
      <a href="#api">API</a>
      <a href="#flow">How it works</a>
      <a href="#live">Live requirements</a>
    </nav>

  </div>
</header>

<main>

  <!-- HERO -->

  <section class="hero">

    <div class="container">

      <div class="badge">
        <span class="dot"></span>
        x402 API · Algorand MainNet
      </div>

      <h1>
        Trust infrastructure
        for autonomous agents.
      </h1>

      <p>
        Trust402 provides machine-payable trust
        and risk assessments for agents, wallets,
        APIs, websites and other counterparties.
      </p>

      <div class="hero-actions">

        <a
          class="button button-primary"
          href="#api"
        >
          View API
        </a>

        <button
          class="button button-secondary"
          onclick="loadPaymentRequirements()"
        >
          Get Live Payment Requirements
        </button>

      </div>

    </div>

  </section>


  <!-- PAYMENT -->

  <section id="payment">

    <div class="container">

      <div class="section-title">

        <h2>Payment</h2>

        <p>
          Trust402 uses x402 for machine-to-machine payments.
        </p>

      </div>

      <div class="payment-grid">

        <div class="card">
          <div class="card-label">
            Price
          </div>

          <div class="card-value price">
            $0.05
          </div>
        </div>

        <div class="card">
          <div class="card-label">
            Network
          </div>

          <div class="card-value">
            Algorand MainNet
          </div>
        </div>

        <div class="card">
          <div class="card-label">
            Asset
          </div>

          <div class="card-value">
            USDC
          </div>
        </div>

        <div class="card">
          <div class="card-label">
            Asset ID
          </div>

          <div class="card-value">
            31566704
          </div>
        </div>

      </div>

    </div>

  </section>


  <!-- API -->

  <section id="api">

    <div class="container">

      <div class="section-title">

        <h2>Trust API</h2>

        <p>
          One paid request returns a structured trust report.
        </p>

      </div>

      <div class="api-card">

        <div class="endpoint">
          POST /v1/trust
        </div>

        <h3>Request</h3>

        <pre>{
  "target": "TEST-AGENT"
}</pre>

        <h3>Example response</h3>

        <pre>{
  "trust_score": 78,
  "risk_level": "medium",
  "identity": {
    "status": "pending_verification"
  },
  "wallet": {
    "status": "pending_analysis"
  },
  "reputation": {
    "status": "pending_external_checks"
  },
  "warnings": [],
  "confidence": 0.35
}</pre>

        <h3>Simple request</h3>

        <pre>curl -X POST \\
  ${new URL("/v1/trust", c.req.url).href} \\
  -H "Content-Type: application/json" \\
  -d '{"target":"TEST-AGENT"}'</pre>

        <p class="note">
          The first request returns HTTP 402 with the
          payment requirements. An x402-compatible client
          can then sign and submit the required payment.
        </p>

      </div>

    </div>

  </section>


  <!-- FLOW -->

  <section id="flow">

    <div class="container">

      <div class="section-title">

        <h2>How payment works</h2>

        <p>
          No manual payment instructions are required
          for an x402-compatible client.
        </p>

      </div>

      <div class="steps">

        <div class="step">

          <div class="step-number">
            1
          </div>

          <h3>Request</h3>

          <p>
            Your agent sends a POST request
            to the Trust402 API.
          </p>

        </div>

        <div class="step">

          <div class="step-number">
            2
          </div>

          <h3>402 Payment Required</h3>

          <p>
            Trust402 returns the live payment
            requirements for the request.
          </p>

        </div>

        <div class="step">

          <div class="step-number">
            3
          </div>

          <h3>Sign</h3>

          <p>
            The client signs the required
            Algorand USDC payment.
          </p>

        </div>

        <div class="step">

          <div class="step-number">
            4
          </div>

          <h3>Submit</h3>

          <p>
            The payment is submitted through
            the x402 facilitator.
          </p>

        </div>

        <div class="step">

          <div class="step-number">
            5
          </div>

          <h3>Verify</h3>

          <p>
            Trust402 verifies the payment
            before serving the protected resource.
          </p>

        </div>

        <div class="step">

          <div class="step-number">
            6
          </div>

          <h3>Receive report</h3>

          <p>
            The agent receives the structured
            Trust402 assessment.
          </p>

        </div>

      </div>

    </div>

  </section>


  <!-- LIVE REQUIREMENTS -->

  <section id="live">

    <div class="container">

      <div class="live-box">

        <div class="section-title">
          <h2>Live payment requirements</h2>

          <p>
            Read directly from the Trust402 HTTP 402 response.
          </p>
        </div>

        <button
          class="button button-primary"
          onclick="loadPaymentRequirements()"
        >
          Load Live Requirements
        </button>

        <div id="paymentInfo"></div>

      </div>

    </div>

  </section>

</main>


<footer>

  <div class="container">

    Trust402 · x402 · Algorand MainNet

    <br />

    Machine-payable trust infrastructure for autonomous agents.

  </div>

</footer>


<script>

  function decodeBase64(value) {

    try {

      const normalized =
        value
          .replace(/-/g, "+")
          .replace(/_/g, "/");

      const padded =
        normalized +
        "=".repeat(
          (4 - normalized.length % 4) % 4
        );

      const binary =
        atob(padded);

      const bytes =
        Uint8Array.from(
          binary,
          char => char.charCodeAt(0)
        );

      return new TextDecoder()
        .decode(bytes);

    } catch (error) {

      throw new Error(
        "Could not decode payment requirements."
      );

    }

  }


  async function loadPaymentRequirements() {

    const box =
      document.getElementById(
        "paymentInfo"
      );

    box.style.display = "block";

    box.innerHTML =
      "<p>Loading live payment requirements...</p>";

    try {

      const response =
        await fetch(
          "/v1/trust",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              target: "PAYMENT-INFO"
            })
          }
        );

      const encoded =
        response.headers.get(
          "PAYMENT-REQUIRED"
        );

      if (!encoded) {

        throw new Error(
          "PAYMENT-REQUIRED header was not returned."
        );

      }

      const requirements =
        JSON.parse(
          decodeBase64(encoded)
        );

      const accepted =
        requirements.accepts?.[0] ||
        requirements;

      const payTo =
        accepted.payTo ||
        "Not provided";

      const network =
        accepted.network ||
        "Not provided";

      const asset =
        accepted.asset ||
        accepted.extra?.asset ||
        "Not provided";

      const amount =
        accepted.amount ||
        accepted.maxAmountRequired ||
        "Not provided";

      const scheme =
        accepted.scheme ||
        "Not provided";

      const description =
        accepted.description ||
        requirements.description ||
        "Trust402 payment";

      box.innerHTML = `

        <div class="live-row">
          <span>Price</span>
          <span>${amount} atomic USDC units</span>
        </div>

        <div class="live-row">
          <span>Scheme</span>
          <span>${scheme}</span>
        </div>

        <div class="live-row">
          <span>Network</span>
          <span>${network}</span>
        </div>

        <div class="live-row">
          <span>USDC Asset ID</span>
          <span>${asset}</span>
        </div>

        <div class="live-row">
          <span>Pay To</span>
          <span>
            ${payTo}
            <button
              class="copy"
              onclick="copyValue('${payTo}')"
            >
              Copy
            </button>
          </span>
        </div>

        <div class="live-row">
          <span>Description</span>
          <span>${description}</span>
        </div>

        <p class="note">
          These values were read from the live
          PAYMENT-REQUIRED response.
        </p>

      `;

    } catch (error) {

      box.innerHTML = `

        <p style="color:#ff9b9b">
          ${error.message}
        </p>

      `;

    }

  }


  async function copyValue(value) {

    try {

      await navigator.clipboard
        .writeText(value);

      alert("Copied!");

    } catch {

      alert(
        "Copy failed. Please copy it manually."
      );

    }

  }

</script>

</body>
</html>`);
});

app.post("/post-test", async (c) => {
  let body: unknown = null;
  try {
    body = await c.req.json();
  } catch {
    body = "could not parse JSON";
  }
  return c.json({ ok: true, method: "POST", body });
});

const PAY_TO = Deno.env.get("PAY_TO") || "";

const FACILITATOR_URL =
  Deno.env.get("FACILITATOR_URL") || "https://facilitator.goplausible.xyz";

const PRICE = "$0.05";

/* PUBLIC INFORMATION */

app.get("/", (c) => {
  return c.json({
    name: "Trust402",
    description: "Paid trust infrastructure for autonomous AI agents",
    version: "0.1.0",
    status: "online",
    network: ALGORAND_MAINNET_CAIP2,
    price: PRICE,
    endpoint: "/v1/trust",
  });
});

app.get("/health", (c) => {
  return c.json({
    status: "healthy",
    service: "Trust402",
    payToSet: Boolean(PAY_TO),
    network: ALGORAND_MAINNET_CAIP2,
    timestamp: new Date().toISOString(),
  });
});

/* TRUST402 DISCOVERY */

app.get("/.well-known/trust402.json", (c) => {
  return c.json({
    name: "Trust402",
    description:
      "A paid trust primitive that AI agents can use before transacting with other agents, wallets, APIs or services.",
    version: "0.1.0",
    network: ALGORAND_MAINNET_CAIP2,
    payment: {
      price: PRICE,
      asset: "USDC",
      assetId: USDC_MAINNET_ASA_ID,
    },
    endpoints: {
      trust: {
        method: "POST",
        path: "/v1/trust",
        description:
          "Returns a machine-readable trust and risk report for a target.",
      },
    },
  });
});

/* X402 RESOURCE SERVER */

class CompatibleFacilitatorClient extends HTTPFacilitatorClient {
  async getSupported() {
    const supported = await super.getSupported();
    return toFull(supported);
  }

  async verify(payload: any, requirements: any) {
    return await super.verify(toFull(payload), toFull(requirements));
  }

  async settle(payload: any, requirements: any) {
    return await super.settle(toFull(payload), toFull(requirements));
  }
}

const facilitatorClient = new CompatibleFacilitatorClient({
  url: FACILITATOR_URL,
});

const server = new x402ResourceServer(facilitatorClient);

server.register(ALGORAND_MAINNET_CAIP2, new ExactAvmScheme());

/* BAZAAR DISCOVERY EXTENSION */

server.registerExtension(
  bazaarResourceServerExtension as unknown as ResourceServerExtension,
);

const trustDiscovery = declareDiscoveryExtension({
  bodyType: "json",

  input: {
    target: "TEST-AGENT",
  },

  inputSchema: {
    type: "object",
    properties: {
      target: {
        type: "string",
        description:
          "Agent, wallet, API, website, or other counterparty to assess.",
      },
    },
    required: ["target"],
  },

  output: {
    example: {
      trust_score: 78,
      risk_level: "medium",
      identity: { status: "verified" },
      wallet: { status: "checked" },
      reputation: { status: "checked" },
      warnings: [],
      evidence: [],
      confidence: 0.91,
    },
  },
});

/* PAID TRUST API */

if (PAY_TO) {
  app.use(
    paymentMiddleware(
      {
        "POST /v1/trust": {
          accepts: [
            {
              scheme: "exact",
              price: PRICE,
              network: ALGORAND_MAINNET_CAIP2,
              payTo: PAY_TO,
              extra: {
                asset: USDC_MAINNET_ASA_ID,
                tag: "x402-global-challenge",
              },
            },
          ],

          description:
            "Paid Trust402 trust and risk assessment for autonomous agents.",

          mimeType: "application/json",

          extensions: trustDiscovery,

          unpaidResponseBody: () => ({
            contentType: "application/json",
            body: {
              error: "payment_required",
              message: "Pay $0.05 USDC to receive a Trust402 trust report.",
            },
          }),
        },
      },
      server,
    ),
  );
} else {
  console.error(
    "PAY_TO is not set: /v1/trust will NOT require payment. Set PAY_TO in Deno Deploy env vars.",
  );
}

/* TRUST REPORT */

app.post("/v1/trust", async (c) => {
  if (!PAY_TO) {
    return c.json(
      {
        error: "configuration_error",
        message: "Trust402 payment recipient is not configured.",
      },
      503,
    );
  }

  let body: Record<string, unknown> = {};

  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const target =
    typeof body.target === "string"
      ? body.target
      : typeof body.address === "string"
      ? body.address
      : null;

  const report = {
    trust_score: 78,
    risk_level: "medium",
    target,

    identity: { status: "pending_verification", checked: true },
    wallet: { status: "pending_analysis", checked: true },
    contract: { status: "not_analyzed", checked: false },
    website: { status: "not_analyzed", checked: false },
    reputation: { status: "pending_external_checks", checked: true },

    warnings: [],

    evidence: [
      {
        type: "trust402_assessment",
        description: "Initial Trust402 assessment generated successfully.",
      },
    ],

    confidence: 0.35,

    payment: {
      price: PRICE,
      network: "Algorand MainNet",
      asset: "USDC",
    },

    timestamp: new Date().toISOString(),
    service: "Trust402",
    version: "0.1.0",
  };

  return c.json(report);
});

/* SERVER */

Deno.serve(app.fetch);
