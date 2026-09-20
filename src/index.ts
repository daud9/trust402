export default {
  async fetch(request: Request): Promise<Response> {
    return Response.json({
      name: "Trust402",
      status: "online",
      version: "0.1.0",
      message: "Trust infrastructure for autonomous agents"
    });
  }
};
