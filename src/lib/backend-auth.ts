// 실제 grandfood_backend(Container App)에 보호자 로그인/회원가입을 연결한다.
//
// 왜 session.tsx의 로컬 세션과 분리했는가: 이 앱은 한 브라우저에서 "이용자 본인" ↔ "가족 보호자"
// 탭을 오가며 데모하는 구조라(local-store.ts 참고), 보호자로 로그인해 받은 실제 토큰을 "이용자 본인"
// 화면(예: /user/diet의 사진 업로드)에서도 계속 써야 한다. 로컬 세션과 합치면 역할을 전환할 때
// 토큰이 함께 사라져서 못 쓰게 된다.
//
// 토큰은 보호자 1명짜리 슬롯이 아니라 "보호자 이메일 -> 토큰" 맵으로 저장한다. 슬롯 하나로 두면
// 브라우저에서 보호자 A로 로그인했다가 나중에 보호자 B로도 로그인할 경우, A의 어르신을 처음
// 업로드할 때(아직 backendWardIdMapStore에 캐시되기 전) B의 토큰으로 만들어져서 실제 백엔드에
// 엉뚱한 보호자 소유로 저장돼버리는 문제가 있었다 — 맵으로 바꾸고, 어떤 어르신(mockWardId)인지에
// 따라 그 어르신을 관리하는 진짜 보호자 계정(auth.ts의 account.wardIds)을 찾아서 그 계정의 토큰만
// 골라 쓰도록 한다.
import { createLocalStore } from "@/lib/local-store";
import { API_BASE_URL } from "@/lib/api-config";
import { getAccounts } from "@/lib/auth";
import { CONDITION_POOL, getCareProfile } from "@/lib/care-profile";

// 설문(care-profile.ts CONDITION_POOL)의 한국어 질환명 -> 백엔드 ConditionFlag(영문 enum) 매핑.
// 키 타입을 `(typeof CONDITION_POOL)[number]`로 못박아서, 나중에 CONDITION_POOL에 새 질환이
// 추가되는데 여기 매핑을 깜빡하면 (조용히 필터링되는 게 아니라) 컴파일 에러로 바로 드러나게 한다.
// PR #10(307f93b)부터 백엔드 ConditionFlag도 6종이라 지금은 1:1로 맞는다.
const CONDITION_LABEL_TO_BACKEND_FLAG: Record<(typeof CONDITION_POOL)[number], string> = {
  고혈압: "hypertension",
  당뇨: "diabetes",
  심부전: "heart_failure",
  신장질환: "chronic_kidney_disease",
  치매: "dementia",
  관절염: "arthritis",
};

function getBackendConditionFlags(mockWardId: string): string[] {
  // conditions는 설문 자유 응답이라 타입상 string[]이지 CONDITION_POOL 리터럴로 좁혀지진 않는다
  // (UI는 CONDITION_POOL만 고르게 하지만 타입까지 강제하진 않음) — 위 매핑표의 타입 안전성은
  // "표 자체가 CONDITION_POOL을 다 커버하는지"를 잡아주는 용도라, 여기 조회는 느슨하게 한다.
  const lookup = CONDITION_LABEL_TO_BACKEND_FLAG as Record<string, string | undefined>;
  const conditions = getCareProfile(mockWardId)?.conditions ?? [];
  return conditions
    .map((c) => lookup[c])
    .filter((flag): flag is string => flag !== undefined);
}

export type BackendGuardianSession = {
  accessToken: string;
  guardianId: string;
  name: string;
};

// 보호자 이메일(=로컬 계정의 loginId) -> 실제 백엔드 세션.
export const backendGuardianSessionStore = createLocalStore<Record<string, BackendGuardianSession>>(
  "grandfood-app-backend-guardian-sessions",
  {}
);

// 목업 wardId("001" 등) -> 실제 백엔드 User UUID 매핑 캐시. 한 번 만든 뒤로는 재사용해서
// POST /users 호출로 어르신 레코드가 중복 생성되는 걸 막는다.
export const backendWardIdMapStore = createLocalStore<Record<string, string>>(
  "grandfood-app-backend-ward-map",
  {}
);

async function parseErrorResponse(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const detail = body?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail.map((e) => (typeof e?.msg === "string" ? e.msg : JSON.stringify(e))).join(", ");
    }
  } catch {
    // 응답 바디가 JSON이 아닌 경우 아래 기본 메시지로 폴백
  }
  return `요청이 실패했어요 (status ${response.status})`;
}

// 이 목업 wardId를 관리하는 로컬 보호자 계정의 이메일(=loginId)을 찾는다.
// auth.ts의 Account.wardIds(보호자가 돌보는 대상자 id 목록)를 그대로 활용한다.
function findGuardianLoginIdForWard(mockWardId: string): string | null {
  const guardian = getAccounts().find(
    (account) => account.role === "guardian" && account.wardIds?.includes(mockWardId)
  );
  return guardian?.loginId ?? null;
}

// 특정 어르신(mockWardId)을 실제로 관리하는 보호자의 백엔드 세션을 찾는다.
// 그 어르신을 관리하는 보호자 계정이 없거나, 있어도 아직 실제 백엔드 로그인을 한 적 없으면 null.
export function getBackendGuardianSessionForWard(mockWardId: string): BackendGuardianSession | null {
  const guardianLoginId = findGuardianLoginIdForWard(mockWardId);
  if (!guardianLoginId) return null;
  return backendGuardianSessionStore.read()[guardianLoginId] ?? null;
}

function saveGuardianSession(email: string, session: BackendGuardianSession) {
  backendGuardianSessionStore.update((prev) => ({ ...prev, [email]: session }));
}

// POST /auth/guardians/register — 보호자 회원가입 + 로그인 토큰 발급을 한 번에 처리한다.
export async function registerGuardianBackend(input: {
  name: string;
  phone: string;
  email: string;
  password: string;
  relationship: string;
}): Promise<{ session: BackendGuardianSession } | { error: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/guardians/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      return { error: await parseErrorResponse(response) };
    }
    const data = await response.json();
    const session: BackendGuardianSession = {
      accessToken: data.access_token,
      guardianId: data.guardian_id,
      name: data.name,
    };
    saveGuardianSession(input.email, session);
    return { session };
  } catch {
    return { error: "서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요." };
  }
}

// POST /auth/guardians/login
export async function loginGuardianBackend(
  email: string,
  password: string
): Promise<{ session: BackendGuardianSession } | { error: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/guardians/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      return { error: await parseErrorResponse(response) };
    }
    const data = await response.json();
    const session: BackendGuardianSession = {
      accessToken: data.access_token,
      guardianId: data.guardian_id,
      name: data.name,
    };
    saveGuardianSession(email, session);
    return { session };
  } catch {
    return { error: "서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요." };
  }
}

// createBackendWard()와 ensureBackendWardId() 둘 다 결국 "로그인된 보호자 세션으로 POST /users"를
// 한다 — 필드 구성(조건 포함 여부 등)만 다를 뿐 요청/에러 처리 로직 자체가 같아서 하나로 묶었다.
// 예전엔 이 fetch 블록이 두 함수에 각각 따로 있어서, 한쪽만 고치고 다른 쪽을 놓치기 쉬웠다.
async function postNewBackendUser(params: {
  accessToken: string;
  name: string;
  birthDate: string; // "YYYY-MM-DD"
  phone: string;
  address: string;
  conditionFlags?: string[];
}): Promise<{ userId: string } | { error: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.accessToken}`,
      },
      body: JSON.stringify({
        name: params.name,
        birth_date: params.birthDate,
        phone: params.phone,
        address: params.address,
        plan_type: "base",
        condition_flags: params.conditionFlags ?? [],
      }),
    });
    if (!response.ok) {
      return { error: await parseErrorResponse(response) };
    }
    const data = await response.json();
    return { userId: data.user_id as string };
  } catch {
    return { error: "서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요." };
  }
}

// POST /users — 초대에 동의하는 시점에, 그 초대를 발급한 보호자의 백엔드 세션으로
// 완전히 새로운 어르신(User)을 만든다. ensureBackendWardId()와 달리 "이미 있는 목업
// ward를 나중에 매핑"하는 게 아니라 여기서 처음 만들어지는 진짜 ward라, 캐시 조회 없이
// 항상 POST하고 응답 user_id를 그대로 진짜 ward id로 쓴다. 이 시점엔 아직 로컬 ward id 자체가
// 없어(이 호출의 결과가 곧 그 id) care-profile 설문을 조회할 방법이 없으므로 condition_flags는
// 항상 비어서 나간다 — 설문은 이 다음 화면(/invite/survey)에서 이뤄진다.
export async function createBackendWard(params: {
  guardianLoginId: string;
  name: string;
  birthDate: string; // "YYYY-MM-DD"
  phone: string;
  address: string;
}): Promise<{ userId: string } | { error: string }> {
  const session = backendGuardianSessionStore.read()[params.guardianLoginId];
  if (!session) {
    return { error: "보호자가 아직 실제 계정 연동을 완료하지 않았어요. 보호자에게 문의해 주세요." };
  }

  return postNewBackendUser({
    accessToken: session.accessToken,
    name: params.name,
    birthDate: params.birthDate,
    phone: params.phone,
    address: params.address,
  });
}

// ensureBackendWardId()는 rag-chat.ts와 meal-log-store.ts 양쪽에서 부른다. 캐시가 아직 비어있는
// 상태에서 두 곳이 거의 동시에(예: 질문 전송 직후 바로 사진 업로드) 호출하면, 서로 상대방이 이미
// POST /users를 보낸 걸 모른 채 각자 요청을 보내 같은 어르신이 중복 생성될 수 있다. 같은 mockWardId에
// 대한 요청이 이미 진행 중이면 새로 fetch하지 않고 그 진행 중인 Promise를 그대로 기다리게 해서 막는다.
const pendingEnsureRequests = new Map<string, Promise<string | null>>();

// POST /users — 로그인한 보호자 아래에 실제 어르신(User) 레코드를 만들어 UUID를 확보한다.
// 목업 Ward에는 phone/정확한 birth_date가 없어서(있는 건 age뿐) 백엔드 필수 필드를 채우기 위한
// 임시 값을 채운다 — 진짜 개인정보가 아니라, 사진 업로드 함수를 호출하기 위한 최소 더미 데이터.
export async function ensureBackendWardId(params: {
  mockWardId: string;
  name: string;
  age: number;
  address: string;
}): Promise<string | null> {
  const cached = backendWardIdMapStore.read()[params.mockWardId];
  if (cached) return cached;

  const pending = pendingEnsureRequests.get(params.mockWardId);
  if (pending) return pending;

  const request = createBackendWardIdRequest(params);
  pendingEnsureRequests.set(params.mockWardId, request);
  try {
    return await request;
  } finally {
    pendingEnsureRequests.delete(params.mockWardId);
  }
}

async function createBackendWardIdRequest(params: {
  mockWardId: string;
  name: string;
  age: number;
  address: string;
}): Promise<string | null> {
  const session = getBackendGuardianSessionForWard(params.mockWardId);
  if (!session) return null;

  const currentYear = new Date().getFullYear();
  // 이 시점(첫 RAG 질문/사진 업로드)까지 답한 설문이 있으면 같이 실어서, 백엔드가
  // health_profiles.condition_flags를 온보딩과 함께 만들도록 한다 — RAG 개인화
  // (rag/service.py get_user_conditions)가 이 값을 읽는다.
  const result = await postNewBackendUser({
    accessToken: session.accessToken,
    name: params.name,
    birthDate: `${currentYear - params.age}-01-01`,
    phone: "000-0000-0000",
    address: params.address,
    conditionFlags: getBackendConditionFlags(params.mockWardId),
  });
  if ("error" in result) return null;

  backendWardIdMapStore.update((prev) => ({ ...prev, [params.mockWardId]: result.userId }));
  return result.userId;
}
