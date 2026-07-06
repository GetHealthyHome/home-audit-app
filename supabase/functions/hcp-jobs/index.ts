// Housecall Pro job proxy for the HomSci Pro field app.
// The company API key stays server-side (secret HCP_API_KEY); signed-in crew
// get a slim, read-only list of upcoming jobs. verify_jwt is enabled, so
// requests must carry a valid Supabase JWT.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

interface HcpJob {
  id?: string;
  description?: string;
  work_status?: string;
  customer?: { first_name?: string; last_name?: string };
  address?: { street?: string; city?: string; state?: string };
  schedule?: { scheduled_start?: string };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return json({ error: "GET only" }, 405);

  const key = Deno.env.get("HCP_API_KEY");
  if (!key) return json({ configured: false, jobs: [] });

  const days = Math.min(
    Math.max(parseInt(new URL(req.url).searchParams.get("days") ?? "14", 10) || 14, 1),
    60,
  );
  const min = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const max = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();

  const upstream = await fetch(
    `https://api.housecallpro.com/jobs?scheduled_start_min=${encodeURIComponent(min)}&scheduled_start_max=${encodeURIComponent(max)}&page_size=100`,
    { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } },
  );
  if (!upstream.ok) {
    return json({
      configured: true,
      error: `Housecall Pro API responded ${upstream.status}`,
      jobs: [],
    });
  }

  const data = await upstream.json();
  const jobs = ((data.jobs ?? []) as HcpJob[]).map((j) => ({
    id: j.id ?? "",
    customer: [j.customer?.first_name, j.customer?.last_name].filter(Boolean).join(" "),
    address: j.address
      ? [j.address.street, j.address.city, j.address.state].filter(Boolean).join(", ")
      : "",
    scheduledStart: j.schedule?.scheduled_start ?? null,
    workStatus: j.work_status ?? "",
    description: j.description ?? "",
  }));

  return json({ configured: true, jobs });
});
