"use client";

// 복용약 기반 영양소·음식 안내 — 백엔드 /medication/* 에 연결한다.
// (grandfood_backend/src/domains/medication)
//
// 이 기능이 기존 RAG 챗봇(rag-chat.ts)과 다른 점:
// RAG는 LLM이 문서를 읽고 답을 만들지만, 여기는 백엔드가 CSV 표를 뒤져서 답을 먼저
// 확정한다. 그래서 /advise 계열은 LLM을 아예 안 거치고, 응답이 구조화된 JSON이라
// 카드 UI로 바로 그릴 수 있다. 빠르고 비용도 없다.
// /ask만 그 확정된 결과에 LLM이 말투를 입힌다.
//
// ⚠️ 화면에 반드시 지켜야 할 것 두 가지 (의약품 안내라 법적으로 중요하다):
//   1) consultNotice(약사·의사 상담 안내)를 항상 노출할 것
//   2) 근거 문장을 보여줄 때 source(출처)를 같이 보여줄 것
// 백엔드가 두 값을 항상 채워서 내려주니 화면에서 빠뜨리지만 않으면 된다.

import { API_BASE_URL } from "@/lib/api-config";
import { resolveBackendWardAccess } from "@/lib/backend-auth";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

const BACKEND_SESSION_REQUIRED_MESSAGE =
  "이 대상자를 관리하는 보호자 계정 또는 본인 계정으로 로그인해야 복약 안내를 볼 수 있어요.";

// 표만 조회하는 엔드포인트는 LLM을 안 거쳐서 금방 끝난다. LLM을 거치는 /ask만
// rag-chat.ts와 같은 30초를 준다.
const LOOKUP_TIMEOUT_MS = 10_000;
const LLM_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

/** 복용약 체크리스트 한 칸. code를 다시 API에 보낸다. */
export type DrugGroup = {
  code: string;
  label: string;
  conditions: string[];
};

/** "같이 먹어도 되나요?" 물어볼 수 있는 상용약. */
export type OtcDrug = {
  name: string;
  /** false면 근거 자료가 없는 약 — 흐리게 표시하거나 "자료 없음"을 미리 알려주면 된다. */
  hasData: boolean;
};

/** 부족한 영양소를 채울 반찬 하나. */
export type NutrientFood = {
  banchan: string;
  foodName: string;
  /** 함량 + 단위가 합쳐진 문자열 (예: "627.0mg") */
  amount: string;
  /** 함량 기준 (항상 "100g당") */
  basis: string;
  source: string;
};

/** 부족해질 수 있는 영양소 하나. */
export type NutrientRisk = {
  nutrient: string;
  drugGroupLabel: string;
  ingredient: string;
  /** 식약처 문서 원문 문장. 요약하지 말고 그대로 보여줄 것. */
  evidence: string;
  source: string;
  /**
   * 이 영양소가 몸에서 하는 일을 설명한 문장. 2025 한국인 영양소 섭취기준에서 인용했다.
   * "칼륨이 뭐예요?"를 눌렀을 때 보여주기 좋다.
   *
   * 빈 문자열이면 아직 검수가 안 끝난 영양소라는 뜻이니 **아무것도 띄우지 말 것.**
   * 프론트에서 대신 설명을 만들어 넣으면 안 된다 — 출처 없는 문장이 되고,
   * '피로 회복에 도움' 같은 표현은 건강기능식품 기능성 표시라 쓰면 안 되는 형태다.
   */
  explanation: string;
  explanationSource: string;
  foods: NutrientFood[];
  /**
   * 비어 있지 않으면 "반찬을 일부러 추천하지 않은 경우"다. 이때 foods는 빈 배열이고,
   * 이 문장을 대신 보여줘야 한다. 데이터가 없어서가 아니라 안내하면 안 되는 경우가 있다 —
   * 예를 들어 이뇨제를 드시는 분께 나트륨 보충(짠 음식)을 권하면 안 되고,
   * 항응고제를 드시는 분께 비타민K 보충을 권하면 약효가 떨어진다.
   */
  noFoodReason: string;
};

/** 조심할 음식 하나. */
export type FoodCaution = {
  food: string;
  drugGroupLabel: string;
  ingredient: string;
  evidence: string;
  source: string;
};

export type OtcEvidence = {
  drugGroupLabel: string;
  /** 원문에서 이 약군과 이어준 표현 (예: "ACE 저해제") */
  keyword: string;
  evidence: string;
  source: string;
};

/**
 * 상용약 병용 확인 결과.
 *
 * verdict에 "먹어도 된다 / 안 된다"가 없는 건 의도한 것이다. 그건 복약지도라서
 * 서비스가 내릴 수 있는 결론이 아니다. 화면에서도 "드셔도 됩니다" 같은 문구를
 * 만들어 붙이지 말고, evidence(설명서 원문)를 보여주고 상담을 안내하는 선까지만 하자.
 */
export type OtcCheck = {
  otcName: string;
  /** "주의사항있음" | "기록없음" | "자료없음" */
  verdict: "주의사항있음" | "기록없음" | "자료없음";
  evidences: OtcEvidence[];
};

export type MedicationAdvice = {
  medications: DrugGroup[];
  nutrientRisks: NutrientRisk[];
  foodCautions: FoodCaution[];
  otcCheck: OtcCheck | null;
  /** 화면에 반드시 노출할 것. */
  consultNotice: string;
};

export type MedicationAnswer = {
  answer: string;
  sources: string[];
  advice: MedicationAdvice;
};

// ---------------------------------------------------------------------------
// 백엔드 응답(snake_case) → 프론트 타입(camelCase) 변환
// ---------------------------------------------------------------------------
// 백엔드는 파이썬이라 snake_case로 내려온다. 화면 코드에서 두 표기가 섞이면 헷갈리니
// 여기서 한 번에 바꿔놓는다 — rag-chat.ts가 matched_conditions를 matchedConditions로
// 바꿔주는 것과 같은 이유다.

type RawAdvice = {
  medications: DrugGroup[];
  nutrient_risks: Array<{
    nutrient: string;
    drug_group_label: string;
    ingredient: string;
    evidence: string;
    source: string;
    explanation: string;
    explanation_source: string;
    foods: Array<{
      banchan: string;
      food_name: string;
      amount: string;
      basis: string;
      source: string;
    }>;
    no_food_reason: string;
  }>;
  food_cautions: Array<{
    food: string;
    drug_group_label: string;
    ingredient: string;
    evidence: string;
    source: string;
  }>;
  otc_check: {
    otc_name: string;
    verdict: OtcCheck["verdict"];
    evidences: Array<{
      drug_group_label: string;
      keyword: string;
      evidence: string;
      source: string;
    }>;
  } | null;
  consult_notice: string;
};

function toAdvice(raw: RawAdvice): MedicationAdvice {
  return {
    medications: raw.medications ?? [],
    nutrientRisks: (raw.nutrient_risks ?? []).map((r) => ({
      nutrient: r.nutrient,
      drugGroupLabel: r.drug_group_label,
      ingredient: r.ingredient,
      evidence: r.evidence,
      source: r.source,
      explanation: r.explanation ?? "",
      explanationSource: r.explanation_source ?? "",
      foods: (r.foods ?? []).map((f) => ({
        banchan: f.banchan,
        foodName: f.food_name,
        amount: f.amount,
        basis: f.basis,
        source: f.source,
      })),
      noFoodReason: r.no_food_reason ?? "",
    })),
    foodCautions: (raw.food_cautions ?? []).map((c) => ({
      food: c.food,
      drugGroupLabel: c.drug_group_label,
      ingredient: c.ingredient,
      evidence: c.evidence,
      source: c.source,
    })),
    otcCheck: raw.otc_check
      ? {
          otcName: raw.otc_check.otc_name,
          verdict: raw.otc_check.verdict,
          evidences: (raw.otc_check.evidences ?? []).map((e) => ({
            drugGroupLabel: e.drug_group_label,
            keyword: e.keyword,
            evidence: e.evidence,
            source: e.source,
          })),
        }
      : null,
    consultNotice: raw.consult_notice,
  };
}

/** fetch + 타임아웃 + 상태코드 확인을 한 군데로 모아둔 헬퍼. */
async function request<T>(
  path: string,
  init: RequestInit,
  timeoutMs: number,
  실패메시지: string
): Promise<T> {
  const { promise, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    `${API_BASE_URL}${path}`,
    init,
    timeoutMs
  );

  try {
    const response = await promise;
    if (!response.ok) {
      throw new Error(`${실패메시지} (status ${response.status})`);
    }
    // 타임아웃을 본문을 다 읽을 때까지 살려둔다 — 헤더는 빨리 왔는데 본문 스트리밍이
    // 멈추는 경우도 커버해야 한다 (rag-chat.ts와 같은 이유).
    return (await response.json()) as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.");
    }
    throw err;
  } finally {
    clearRequestTimeout();
  }
}

// ---------------------------------------------------------------------------
// 기준 정보 — 로그인 없이 부를 수 있다 (개인정보 없는 고정 목록)
// ---------------------------------------------------------------------------

/**
 * 복용약 체크리스트에 쓸 약군 목록.
 *
 * 화면에서 "blood_pressure" 같은 코드를 하드코딩하지 말고 이걸 불러서 그리자.
 * 백엔드에 약군이 추가돼도 프론트를 고칠 필요가 없어진다.
 */
export async function fetchDrugGroups(): Promise<DrugGroup[]> {
  return request<DrugGroup[]>(
    "/medication/groups",
    { method: "GET" },
    LOOKUP_TIMEOUT_MS,
    "복용약 목록을 불러오지 못했어요"
  );
}

/** "같이 먹어도 되나요?"를 물어볼 수 있는 상용약 목록. */
export async function fetchOtcDrugs(): Promise<OtcDrug[]> {
  const raw = await request<Array<{ name: string; has_data: boolean }>>(
    "/medication/otc",
    { method: "GET" },
    LOOKUP_TIMEOUT_MS,
    "상비약 목록을 불러오지 못했어요"
  );
  return raw.map((o) => ({ name: o.name, hasData: o.has_data }));
}

// ---------------------------------------------------------------------------
// 조회 — LLM 없이 표만으로 확정된 결과 (빠름 / 비용 없음)
// ---------------------------------------------------------------------------

/**
 * 약군을 직접 넣어서 조회한다. 로그인이 필요 없다.
 *
 * 온보딩에서 체크박스를 고르는 즉시 "이런 안내가 나와요"를 미리 보여주거나,
 * 로그인 전 체험 화면에 쓰기 좋다.
 */
export async function adviseByGroups(params: {
  medicationGroups: string[];
  otcName?: string;
}): Promise<MedicationAdvice> {
  const raw = await request<RawAdvice>(
    "/medication/advise",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        medication_groups: params.medicationGroups,
        otc_name: params.otcName ?? null,
      }),
    },
    LOOKUP_TIMEOUT_MS,
    "복약 안내를 불러오지 못했어요"
  );
  return toAdvice(raw);
}

/**
 * 저장된 그 대상자의 복용약으로 조회한다. 약군을 다시 보낼 필요가 없다.
 *
 * 인증 방식은 rag-chat.ts와 완전히 같다 — 이 대상자를 관리하는 보호자가 실제 백엔드
 * 로그인을 했거나, 본인(자가등록 개인 이용자)이 로그인한 적이 있어야 한다.
 * 목업 wardId로는 호출할 수 없다.
 */
export async function adviseForWard(params: {
  wardId: string;
  wardName: string;
  wardAge: number;
  wardAddress: string;
  otcName?: string;
}): Promise<MedicationAdvice> {
  const access = await resolveBackendWardAccess({
    mockWardId: params.wardId,
    name: params.wardName,
    age: params.wardAge,
    address: params.wardAddress,
  });
  if (!access) {
    throw new Error(BACKEND_SESSION_REQUIRED_MESSAGE);
  }

  const raw = await request<RawAdvice>(
    `/medication/users/${access.backendWardId}/advise`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access.accessToken}`,
      },
      body: JSON.stringify({
        medication_groups: [],
        otc_name: params.otcName ?? null,
      }),
    },
    LOOKUP_TIMEOUT_MS,
    "복약 안내를 불러오지 못했어요"
  );
  return toAdvice(raw);
}

// ---------------------------------------------------------------------------
// 안내문 — LLM이 말투를 입힌 결과 (Azure OpenAI 호출 = 비용 발생)
// ---------------------------------------------------------------------------

/**
 * 어르신 질문에 안내문으로 답한다.
 *
 * 근거만 필요하고 문장이 필요 없다면 adviseForWard를 쓰자 — 훨씬 빠르고 비용도 없다.
 * 응답의 advice에 근거가 그대로 들어있어서, "이 문장 어디서 나온 거예요?"를 눌렀을 때
 * 바로 펼쳐 보여줄 수 있다.
 */
export async function askMedicationQuestion(params: {
  wardId: string;
  wardName: string;
  wardAge: number;
  wardAddress: string;
  query: string;
  otcName?: string;
}): Promise<MedicationAnswer> {
  const access = await resolveBackendWardAccess({
    mockWardId: params.wardId,
    name: params.wardName,
    age: params.wardAge,
    address: params.wardAddress,
  });
  if (!access) {
    throw new Error(BACKEND_SESSION_REQUIRED_MESSAGE);
  }

  const raw = await request<{ answer: string; sources?: string[]; advice: RawAdvice }>(
    `/medication/users/${access.backendWardId}/ask`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access.accessToken}`,
      },
      body: JSON.stringify({ query: params.query, otc_name: params.otcName ?? null }),
    },
    LLM_TIMEOUT_MS,
    "복약 안내 응답 요청이 실패했어요"
  );

  return {
    answer: raw.answer,
    sources: raw.sources ?? [],
    advice: toAdvice(raw.advice),
  };
}
