// Crew account management for the HomSci Pro admin portal.
// verify_jwt is enabled, so callers must be signed in; the function then
// checks the caller's profile role and only admins may proceed. Privileged
// operations use the service-role key, which never leaves the server.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const URL_BASE = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function svc(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(URL_BASE + path, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function callerUserId(req: Request): Promise<string | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const r = await fetch(`${URL_BASE}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const uid = await callerUserId(req);
  if (!uid) return json({ error: "Not signed in" }, 401);

  const profR = await svc(`/rest/v1/profiles?id=eq.${uid}&select=role`);
  const prof = profR.ok ? await profR.json() : [];
  if (prof?.[0]?.role !== "admin") return json({ error: "Admin access required" }, 403);

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const action = body.action ?? "";
  const role = body.role === "admin" ? "admin" : "auditor";

  if (action === "create") {
    if (!body.email || !body.password) return json({ error: "Email and password required" }, 400);
    const r = await svc("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: { name: body.name ?? "" },
      }),
    });
    const data = await r.json();
    if (!r.ok) return json({ error: data?.msg ?? data?.message ?? `Create failed (${r.status})` }, 400);
    // The on-signup trigger created the profile; apply the requested role.
    await svc(`/rest/v1/profiles?id=eq.${data.id}`, {
      method: "PATCH",
      body: JSON.stringify({ role, name: body.name ?? "" }),
    });
    return json({ ok: true, id: data.id });
  }

  if (action === "set-role") {
    if (!body.userId) return json({ error: "userId required" }, 400);
    if (body.userId === uid && role !== "admin") {
      return json({ error: "You cannot remove your own admin role." }, 400);
    }
    const r = await svc(`/rest/v1/profiles?id=eq.${body.userId}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ role }),
    });
    if (!r.ok) return json({ error: `Role update failed (${r.status})` }, 400);
    return json({ ok: true });
  }

  if (action === "set-password") {
    if (!body.userId || !body.password) return json({ error: "userId and password required" }, 400);
    const r = await svc(`/auth/v1/admin/users/${body.userId}`, {
      method: "PUT",
      body: JSON.stringify({ password: body.password }),
    });
    if (!r.ok) return json({ error: `Password reset failed (${r.status})` }, 400);
    return json({ ok: true });
  }

  if (action === "delete") {
    if (!body.userId) return json({ error: "userId required" }, 400);
    if (body.userId === uid) return json({ error: "You cannot delete your own account." }, 400);
    const r = await svc(`/auth/v1/admin/users/${body.userId}`, { method: "DELETE" });
    if (!r.ok) return json({ error: `Delete failed (${r.status})` }, 400);
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
});
