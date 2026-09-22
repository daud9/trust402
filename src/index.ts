import { Hono } from "npm:hono";
import {
  paymentMiddleware,
  x402ResourceServer,
} from "npm:@x402/hono";
import { HTTPFacilitatorClient } from "npm:@x402/core/server";
import { ExactAvmScheme } from "npm:@x402/avm/exact/server";
import {
  ALGORAND_TESTNET_CAIP2,
  USDC_TESTNET_ASA_ID,
} from "npm:@x402/avm";
import {
  declareDiscoveryExtension,
  bazaarResourceServerExtension,
} from "npm:@x402-avm/extensions";
import type { ResourceServerExtension } from "npm:@x402/core/types";

const app = new Hono();

const PAY_TO = Deno.env.get("PAY_TO") || "";

const FACILITATOR_URL =
  Deno.env.get("FACILITATOR_URL") ||
  "https://facilitator.goplausible.xyz";

const PRICE = "$0.05";

/*
 * ---------------------------------------------------------
 * PUBLIC INFORMATION
 * ---------------------------------------------------------
 */

app.get("/", (c) => {
  return c.json({
    name: "Trust402",
    description:
      "Paid trust infrastructure for autonomous AI agents",
    version: "0.1.0",
    status: "online",
    network: "Algorand TestNet",
    price: PRICE,
    endpoint: "/v1/trust",
  });
});

app.get("/health", (c) => {
  return c.json({
    status: "healthy",
    service: "Trust402",
    timestamp: new Date().toISOString(),
  });
});

/*
 * ---------------------------------------------------------
 * TRUST402 DISCOVERY
 * ---------------------------------------------------------
 */

app.get("/.well-known/trust402.json", (c) => {
  return c.json({
    name: "Trust402",
    description:
      "A paid trust primitive that AI agents can use before transacting with other agents, wallets, APIs or services.",
    version: "0.1.0",
    network: ALGORAND_TESTNET_CAIP2,
    payment: {
      price: PRICE,
      asset: "USDC",
      assetId: USDC_TESTNET_ASA_ID,
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

/*
 * ---------------------------------------------------------
 * X402 RESOURCE SERVER
 * ---------------------------------------------------------
 */

const facilitatorClient = new HTTPFacilitatorClient({
  url: FACILITATOR_URL,
});

const server = new x402ResourceServer(facilitatorClient);

/*
 * Register Algorand AVM exact payment scheme.
 */
const avmServerScheme = new ExactAvmScheme();

server.register(
  ALGORAND_TESTNET_CAIP2,
  avmServerScheme,
);

/*
 * Register Bazaar discovery extension.
 */
server.registerExtension(
  bazaarResourceServerExtension as unknown as ResourceServerExtension,
);

/*
 * ---------------------------------------------------------
 * BAZAAR DISCOVERY METADATA
 * ---------------------------------------------------------
 */

const trustDiscovery = declareDiscoveryExtension({
  output: {
    example: {
      trust_score: 78,
      risk_level: "medium",
      identity: {
        status: "verified",
      },
      wallet: {
        status: "checked",
      },
      reputation: {
        status: "checked",
      },
      warnings: [],
      evidence: [],
      confidence: 0.91,
    },
  },
});

/*
 * ---------------------------------------------------------
 * PAID TRUST API
 * ---------------------------------------------------------
 */

if (PAY_TO) {
  app.use(
    paymentMiddleware(
      {
        "POST /v1/trust": {
          accepts: [
            {
              scheme: "exact",
              price: PRICE,
              network: ALGORAND_TESTNET_CAIP2,
              payTo: PAY_TO,
              extra: {
                asset: USDC_TESTNET_ASA_ID,
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
              message:
                "Pay $0.05 USDC to receive a Trust402 trust report.",
            },
          }),
        },
      },
            server,
      undefined,
      undefined,
      true,
    ),
  );
}

/*
 * ---------------------------------------------------------
 * TRUST REPORT
 * ---------------------------------------------------------
 */

app.post("/v1/trust", async (c) => {
  if (!PAY_TO) {
    return c.json(
      {
        error: "configuration_error",
        message:
          "Trust402 payment recipient is not configured.",
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

  /*
   * Initial Trust402 engine.
   *
   * This is intentionally deterministic for the first
   * deployment. External identity, wallet, reputation and
   * risk providers will be connected in the next stage.
   */

  const report = {
    trust_score: 78,

    risk_level: "medium",

    target,

    identity: {
      status: "pending_verification",
      checked: true,
    },

    wallet: {
      status: "pending_analysis",
      checked: true,
    },

    contract: {
      status: "not_analyzed",
      checked: false,
    },

    website: {
      status: "not_analyzed",
      checked: false,
    },

    reputation: {
      status: "pending_external_checks",
      checked: true,
    },

    warnings: [],

    evidence: [
      {
        type: "trust402_assessment",
        description:
          "Initial Trust402 assessment generated successfully.",
      },
    ],

    confidence: 0.35,

    payment: {
      price: PRICE,
      network: ALGORAND_TESTNET_CAIP2,
      asset: "USDC",
    },

    timestamp: new Date().toISOString(),

    service: "Trust402",
    version: "0.1.0",
  };

  return c.json(report);
});

/*
 * ---------------------------------------------------------
 * SERVER
 * ---------------------------------------------------------
 */

Deno.serve(app.fetch);
