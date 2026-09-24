// Public read endpoint for the customer-facing proposal deck.
// The link carries an unguessable per-audit share token (capability URL,
// same model as the public photo URLs); verify_jwt is OFF so customers can
// open it without an account. Only a whitelisted, customer-facing subset of
// the audit payload is returned — internal notes and contact details of the
// crew never leave the server.
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

const URL_BASE = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function svc(path: string): Promise<Response> {
  return fetch(URL_BASE + path, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return json({ error: "GET only" }, 405);

  const t = new URL(req.url).searchParams.get("t") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) {
    return json({ error: "Invalid link" }, 400);
  }

  const auditR = await svc(`/rest/v1/audits?share_token=eq.${t}&select=id,payload,updated_at`);
  const audits = auditR.ok ? await auditR.json() : [];
  const row = audits?.[0];
  if (!row?.payload) return json({ error: "Proposal not found" }, 404);

  // deno-lint-ignore no-explicit-any
  const p: any = row.payload;

  const photosR = await svc(
    `/rest/v1/audit_photos?audit_id=eq.${encodeURIComponent(row.id)}&select=id,label,zone,storage_path`,
  );
  // deno-lint-ignore no-explicit-any
  const photoRows: any[] = photosR.ok ? await photosR.json() : [];
  const byId = new Map(photoRows.map((ph) => [ph.id, ph]));
  const selected: string[] = Array.isArray(p.proposalMedia) ? p.proposalMedia : [];
  const photos = selected
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((ph) => ({
      label: ph.label ?? "Site photo",
      zone: ph.zone ?? "",
      url: `${URL_BASE}/storage/v1/object/public/audit-photos/${ph.storage_path}`,
    }));

  const iaq = p.tests?.iaq ?? {};
  return json({
    customer: { name: p.customer?.name ?? "", address: p.customer?.address ?? "" },
    date: p.appointment?.date ?? (p.createdAt ?? "").slice(0, 10),
    auditor: p.photos?.[0]?.inspector ?? "",
    site: {
      sqft: p.site?.sqft ?? "",
      yearBuilt: p.site?.yearBuilt ?? "",
      bedrooms: p.site?.bedrooms ?? "",
    },
    tests: {
      cfm50: p.tests?.blower?.cfm50 ?? "",
      co2: iaq.co2 ?? "",
      voc: iaq.voc ?? "",
      rh: iaq.rh ?? "",
      pm: iaq.pm ?? "",
    },
    energy: p.energyModel?.climate
      ? {
        location: p.energyModel.resolved
          ? p.energyModel.resolved.name +
            (p.energyModel.resolved.admin1 ? ", " + p.energyModel.resolved.admin1 : "")
          : p.energyModel.location ?? "",
        hdd: p.energyModel.climate.hdd ?? null,
      }
      : null,
    proposal: p.proposalComputed ?? null,
    photos,
    updatedAt: row.updated_at,
  });
});
