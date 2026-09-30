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
import { assess } from "./assess.ts";
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

app.get("/cors-test", (c) => {
  return c.json({ ok: true, service: "Trust402", cors: "working" });
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
const PRICE_ADV = "$0.20";

/* PUBLIC INFORMATION */

app.get("/", (c) => {
  return c.json({
    name: "Trust402",
    description: "Paid trust infrastructure for autonomous AI agents",
    version: "0.2.0",
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
      advanced: {
        method: "POST",
        path: "/v1/trust/advanced",
        price: PRICE_ADV,
        description:
          "Adds transaction flow, counterparty diversity, velocity, holdings, domain expiry and security.txt checks.",
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

const makeDiscovery = () => declareDiscoveryExtension({
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
const trustDiscovery = makeDiscovery();
const trustDiscoveryAdv = makeDiscovery();

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
            "Trust and risk report for an Algorand wallet, .algo name, website or x402 endpoint: on-chain age, activity, identity, domain age, security headers, and payTo checks.",

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

        "POST /v1/trust/advanced": {
          accepts: [
            {
              scheme: "exact",
              price: PRICE_ADV,
              network: ALGORAND_MAINNET_CAIP2,
              payTo: PAY_TO,
              extra: {
                asset: USDC_MAINNET_ASA_ID,
                tag: "x402-global-challenge",
              },
            },
          ],

          description:
            "Advanced Trust402 report: adds transaction flow, counterparty diversity, velocity, holdings, domain expiry and security.txt checks.",

          mimeType: "application/json",

          extensions: trustDiscoveryAdv,

          unpaidResponseBody: () => ({
            contentType: "application/json",
            body: {
              error: "payment_required",
              message: "Pay $0.20 USDC to receive an advanced Trust402 report.",
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

const trustHandler = (deep: boolean) => async (c: any) => {
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

  const report = await assess(target, deep);

  // Returning >= 400 means x402 does NOT settle: unrecognized targets cost nothing.
  if (report.target_type === "label") {
    return c.json(
      {
        error: "unrecognized_target",
        message:
          "Send an Algorand address, a .algo name or an https:// URL. You were not charged.",
      },
      400,
    );
  }

  return c.json(report);
};

app.post("/v1/trust", trustHandler(false));
app.post("/v1/trust/advanced", trustHandler(true));

/* SERVER */

Deno.serve(app.fetch);
