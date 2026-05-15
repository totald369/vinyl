import { NextResponse } from "next/server";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { PURCHASE_FEEDBACK_PERIOD_DAYS } from "@/lib/purchaseFeedbackConstants";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const isDev = process.env.NODE_ENV === "development";

function sinceIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - PURCHASE_FEEDBACK_PERIOD_DAYS);
  return d.toISOString();
}

function logPostgrest(label: string, err: PostgrestError) {
  console.error(`[purchase-feedback] ${label}`, {
    message: err.message,
    code: err.code,
    details: err.details,
    hint: err.hint
  });
}

function devPayload(message: string) {
  return isDev ? { debug: message } : {};
}

/** store_id + 최근 N일 기준 success / failure 건수 (Supabase count, RLS로 막히면 null) */
async function fetchFeedbackCounts(
  client: SupabaseClient,
  storeId: string
): Promise<{ successCount: number; failureCount: number } | null> {
  const since = sinceIso();
  const [successRes, failureRes] = await Promise.all([
    client
      .from("purchase_feedbacks")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("feedback_type", "success")
      .gte("created_at", since),
    client
      .from("purchase_feedbacks")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("feedback_type", "failure")
      .gte("created_at", since)
  ]);

  if (successRes.error) {
    logPostgrest("count success", successRes.error);
    return null;
  }
  if (failureRes.error) {
    logPostgrest("count failure", failureRes.error);
    return null;
  }

  return {
    successCount: successRes.count ?? 0,
    failureCount: failureRes.count ?? 0
  };
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const storeId = params.id;
  if (!storeId) {
    return NextResponse.json({ successCount: 0, failureCount: 0 }, { status: 400 });
  }

  const client = getSupabaseServerClient();
  if (!client) {
    return NextResponse.json({ successCount: 0, failureCount: 0 });
  }

  const counts = await fetchFeedbackCounts(client, storeId);
  if (!counts) {
    return NextResponse.json({
      successCount: 0,
      failureCount: 0,
      ...devPayload("GET count failed (RLS·테이블명·환경변수 확인)")
    });
  }
  return NextResponse.json(counts);
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const storeId = params.id?.trim();
  if (!storeId) {
    return NextResponse.json(
      { error: "missing_store_id", ...devPayload("params.id 비어 있음") },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const feedbackType = (body as { feedbackType?: unknown })?.feedbackType;
  const deviceKeyRaw = (body as { deviceKey?: unknown })?.deviceKey;
  if (feedbackType !== "success" && feedbackType !== "failure") {
    return NextResponse.json(
      { error: "invalid_feedback_type", ...devPayload(`got: ${String(feedbackType)}`) },
      { status: 400 }
    );
  }

  const deviceKey =
    typeof deviceKeyRaw === "string" && deviceKeyRaw.length > 0 && deviceKeyRaw.length <= 128
      ? deviceKeyRaw
      : null;

  const client = getSupabaseServerClient();
  if (!client) {
    return NextResponse.json(
      {
        error: "supabase_not_configured",
        ...devPayload(
          "NEXT_PUBLIC_SUPABASE_URL + (SUPABASE_SERVICE_ROLE_KEY 또는 ANON/PUBLISHABLE 키) 필요"
        )
      },
      { status: 503 }
    );
  }

  const countsBefore = (await fetchFeedbackCounts(client, storeId)) ?? {
    successCount: 0,
    failureCount: 0
  };

  const row = {
    store_id: storeId,
    feedback_type: feedbackType as "success" | "failure",
    device_key: deviceKey
  };

  const { error: insertError } = await client.from("purchase_feedbacks").insert(row);

  if (insertError) {
    logPostgrest("POST insert", insertError);
    return NextResponse.json(
      {
        error: "insert_failed",
        ...devPayload(`${insertError.message} | code=${insertError.code} | details=${insertError.details ?? ""}`)
      },
      { status: 500 }
    );
  }

  let countsAfter = await fetchFeedbackCounts(client, storeId);
  if (!countsAfter) {
    await new Promise((r) => setTimeout(r, 150));
    countsAfter = await fetchFeedbackCounts(client, storeId);
  }
  if (!countsAfter) {
    console.warn(
      "[purchase-feedback POST] recount failed after successful insert; using increment fallback (RLS가 count SELECT를 막는 경우 등)"
    );
    countsAfter = {
      successCount: countsBefore.successCount + (feedbackType === "success" ? 1 : 0),
      failureCount: countsBefore.failureCount + (feedbackType === "failure" ? 1 : 0)
    };
  }

  return NextResponse.json({ ...countsAfter, persisted: true }, { status: 200 });
}
