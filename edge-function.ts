// ============================================================
//  Edge Function: daily-report
//  Generates the AI coaching report. The Anthropic API key lives
//  here as a secret and NEVER reaches the browser.
//  RLS is enforced via the caller's JWT: an admin can request any
//  student; a student can only get their own.
// ============================================================

// Set the model you have access to (see https://docs.claude.com/en/docs/about-claude/models)
const MODEL = "claude-sonnet-4-20250514";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { userId, range = "all" } = await req.json();

    const days = ({ week: 7, month: 30, quarter: 90, all: 9999 } as Record<string, number>)[range] ?? 9999;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffISO = cutoff.toISOString().slice(0, 10);

    // RLS decides whether the caller may read these rows.
    const { data: entries, error } = await supabase
      .from("entries")
      .select("*")
      .eq("user_id", userId)
      .gte("date", range === "all" ? "1900-01-01" : cutoffISO)
      .order("date", { ascending: true });

    if (error) throw error;
    if (!entries || entries.length === 0) {
      return new Response(JSON.stringify({ report: "No entries in this period yet." }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { data: prof } = await supabase.from("profiles").select("name, role").eq("id", userId).maybeSingle();
    const name = prof?.name ?? "the aspirant";

    // ---- summarise ----
    const num = (k: string) => entries.filter((e: any) => e[k] != null);
    const avg = (arr: any[], k: string) => (arr.length ? arr.reduce((s, e) => s + e[k], 0) / arr.length : 0);
    const chk = (k: string) => {
      const d = entries.filter((e: any) => e.checklist && e.checklist[k] !== null && e.checklist[k] !== undefined);
      return d.length ? Math.round((100 * d.filter((e: any) => e.checklist[k] === true).length) / d.length) : 0;
    };
    const hrs = num("hours"), effs = num("eff"), pcts = num("pct");
    const summary = {
      avgHours: avg(hrs, "hours").toFixed(1),
      totHours: hrs.reduce((s: number, e: any) => s + e.hours, 0).toFixed(0),
      avgEff: avg(effs, "eff").toFixed(1),
      avgPct: Math.round(avg(pcts, "pct")),
      revision: chk("revision"), dna: chk("dna"), topper: chk("topper"),
      days: entries.length,
    };
    const recent = entries.slice(-30).map((e: any) => ({
      date: e.date, hours: e.hours, efficiency: e.eff, targetHit: e.pct,
      revision: e.checklist?.revision, dna: e.checklist?.dna, topper: e.checklist?.topper,
      targets: (e.targets || []).filter(Boolean), tomorrow: e.tomorrow || "",
    }));

    const audience = prof?.role === "admin"
      ? `You are reporting to a mentor who oversees many UPSC students. Write about the student "${name}" in the third person.`
      : `You are speaking directly to the aspirant "${name}". Use "you".`;

    const prompt = `You are an experienced UPSC mentor reviewing a daily study tracker. ${audience}

Period summary — avg hours/day ${summary.avgHours}, total ${summary.totHours}h, avg efficiency ${summary.avgEff}/5, avg target completion ${summary.avgPct}%, days logged ${summary.days}. Checklist consistency: Revision ${summary.revision}%, DNA ${summary.dna}%, Topper copies ${summary.topper}%.
Daily log: ${JSON.stringify(recent)}

Write a sharp, honest coaching report in 4 bold-labelled sections: **Where they stand** (2 sentences on the trend), **What's working** (1-2 data-specific strengths), **Fix this** (the single most important pattern to correct + one concrete action), **Focus next week** (2-3 measurable goals). Be specific to the numbers. Under 220 words. Headings in **bold**, no preamble.`;

    const anthropic = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, messages: [{ role: "user", content: prompt }] }),
    });

    const data = await anthropic.json();
    const report = (data.content || []).map((b: any) => (b.type === "text" ? b.text : "")).join("\n").trim();

    return new Response(JSON.stringify({ report: report || "Could not generate a report." }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
