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
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

// notifications.ts와 같은 이유로 인증 관련 요청도 무한정 매달리지 않게 상한을 둔다.
const REQUEST_TIMEOUT_MS = 15_000;

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

// invite/survey/page.tsx도 register-elder-from-invite 호출 시 같은 매핑이 필요해서 export한다.
export function getBackendConditionFlags(mockWardId: string): string[] {
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

export type BackendUserSession = {
  accessToken: string;
  userId: string;
  name: string;
};

// 이용자(어르신 본인 직접가입, guardian_id 없는 B2C 계정) loginId -> 실제 백엔드 세션.
// 보호자 세션 맵과 분리해두는 이유도 동일하다 — 이용자 로그인 아이디와 보호자 이메일은
// 애초에 겹칠 일이 없지만(auth.ts에서 로그인 아이디 형식이 서로 다름), 개념적으로도
// "누구의 토큰인지"를 role별로 분리해두는 게 backendWardIdMapStore와의 혼동을 막는다.
export const backendUserSessionStore = createLocalStore<Record<string, BackendUserSession>>(
  "grandfood-app-backend-user-sessions",
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

// 초대 동의 화면이 "이 보호자가 실제 백엔드 연동을 마쳤는지"를 네트워크 요청 없이 즉시
// fail-fast로 확인할 때 쓴다 — 이 시점엔 아직 만들 ward 자체가 없어 getBackendGuardianSessionForWard
// (mockWardId 기반)를 못 쓴다.
export function hasBackendGuardianSession(guardianLoginId: string): boolean {
  return guardianLoginId in backendGuardianSessionStore.read();
}

function saveGuardianSession(email: string, session: BackendGuardianSession) {
  backendGuardianSessionStore.update((prev) => ({ ...prev, [email]: session }));
}

function saveUserSession(loginId: string, session: BackendUserSession) {
  backendUserSessionStore.update((prev) => ({ ...prev, [loginId]: session }));
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

// GET /auth/me — 로그인 성공 직후엔 알 수 없는 보호자 본인 프로필(phone/relationship)을
// 채워야 할 때 쓴다. login/page.tsx의 크로스디바이스 폴백 로그인(이 기기엔 로컬 계정이 없지만
// 실제 백엔드엔 있는 경우) 이후 로컬 계정을 만들 때가 유일한 용례.
export async function fetchGuardianProfile(
  accessToken: string
): Promise<{ phone: string; relationship: string } | { error: string }> {
  const { promise, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    `${API_BASE_URL}/auth/me`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    REQUEST_TIMEOUT_MS
  );
  try {
    const response = await promise;
    if (!response.ok) {
      return { error: await parseErrorResponse(response) };
    }
    const data = await response.json();
    return { phone: data.phone, relationship: data.relationship };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { error: "서버 응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요." };
    }
    return { error: "서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요." };
  } finally {
    clearRequestTimeout();
  }
}

// POST /auth/users/register — 어르신 본인 자가등록(B2C, guardian_id 없음). 보호자 초대
// 경로(consent-view.tsx)와는 별개다 — 그쪽은 나중에 ensureBackendWardId()가 보호자 토큰으로
// guardian_id 있는 POST /users를 호출해 만들기 때문에, 여기서도 같은 어르신을 또 만들면
// 백엔드에 guardian_id 없는 고아 레코드가 중복 생성된다. 이 함수는 signup/page.tsx의
// "이용자 본인" 직접가입(보호자 없음)에서만 호출해야 한다.
export async function registerUserBackend(input: {
  loginId: string;
  password: string;
  name: string;
  birthDate: string; // "YYYY-MM-DD"
  phone: string;
  address: string;
  planType: string;
}): Promise<{ session: BackendUserSession } | { error: string }> {
  const { promise, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    `${API_BASE_URL}/auth/users/register`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        login_id: input.loginId,
        password: input.password,
        name: input.name,
        birth_date: input.birthDate,
        phone: input.phone,
        address: input.address,
        plan_type: input.planType,
      }),
    },
    REQUEST_TIMEOUT_MS
  );
  try {
    const response = await promise;
    if (!response.ok) {
      return { error: await parseErrorResponse(response) };
    }
    const data = await response.json();
    const session: BackendUserSession = {
      accessToken: data.access_token,
      userId: data.user_id,
      name: data.name,
    };
    saveUserSession(input.loginId, session);
    return { session };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { error: "서버 응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요." };
    }
    return { error: "서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요." };
  } finally {
    clearRequestTimeout();
  }
}

// POST /auth/users/login
export async function loginUserBackend(
  loginId: string,
  password: string
): Promise<{ session: BackendUserSession } | { error: string }> {
  const { promise, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    `${API_BASE_URL}/auth/users/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login_id: loginId, password }),
    },
    REQUEST_TIMEOUT_MS
  );
  try {
    const response = await promise;
    if (!response.ok) {
      return { error: await parseErrorResponse(response) };
    }
    const data = await response.json();
    const session: BackendUserSession = {
      accessToken: data.access_token,
      userId: data.user_id,
      name: data.name,
    };
    saveUserSession(loginId, session);
    return { session };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { error: "서버 응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요." };
    }
    return { error: "서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요." };
  } finally {
    clearRequestTimeout();
  }
}

// ensureBackendWardId()가 결국 하는 일은 "로그인된 보호자 세션으로 POST /users" 하나뿐이라
// fetch/에러 처리를 별도 함수로 뺐다. (예전엔 초대 동의 화면에도 거의 같은 코드가 따로 있었는데,
// 그쪽은 이제 실제 백엔드 유저를 안 만들도록 바뀌어서 이 함수 하나만 남았다 — consent-view.tsx 참고.)
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

// ensureBackendWardId()는 rag-chat.ts와 meal-log-store.ts 양쪽에서 부른다. 캐시가 아직 비어있는
// 상태에서 두 곳이 거의 동시에(예: 질문 전송 직후 바로 사진 업로드) 호출하면, 서로 상대방이 이미
// POST /users를 보낸 걸 모른 채 각자 요청을 보내 같은 어르신이 중복 생성될 수 있다. 같은 mockWardId에
// 대한 요청이 이미 진행 중이면 새로 fetch하지 않고 그 진행 중인 Promise를 그대로 기다리게 해서 막는다.
const pendingEnsureRequests = new Map<string, Promise<string | null>>();

// 캐시에 이미 있는 백엔드 UUID만 돌려준다(없으면 null) — 절대 POST /users를 부르지 않는다.
// 알림 조회처럼 "있으면 보여주고 없으면 그냥 없는 것"이어야 하는 순수 조회 동작에서 쓴다.
// ensureBackendWardId()를 그런 곳에 그대로 쓰면, 사진 업로드/AI 질문 같은 명시적 액션을
// 한 번도 안 한 대상자도 화면에 진입만 해도 더미 phone/생년월일로 실제 어르신 레코드가
// 만들어지는 부수효과가 생긴다(PR#8 리뷰에서 발견).
export function getCachedBackendWardId(mockWardId: string): string | null {
  return backendWardIdMapStore.read()[mockWardId] ?? null;
}

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

// POST /wards/invites — 보호자가 "부모님 등록"을 누를 때 호출. 이 코드를 서버 DB에
// 저장해서, 발급한 기기가 아닌 다른 기기(어르신 휴대폰이 QR을 스캔하는 경우)에서도
// GET /wards/invites/{code}로 조회가 된다 — 예전엔 ward-invite.ts가 로컬(브라우저)
// localStorage에만 저장해서 같은 브라우저에서만 동작했다.
export async function createWardInviteBackend(
  guardianLoginId: string,
  input: { name: string; phone: string }
): Promise<{ code: string; expiresAt: string } | { error: string }> {
  const session = backendGuardianSessionStore.read()[guardianLoginId];
  if (!session) {
    return { error: "보호자가 아직 실제 계정 연동을 완료하지 않았어요. 다시 로그인해 주세요." };
  }
  const { promise, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    `${API_BASE_URL}/wards/invites`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify(input),
    },
    REQUEST_TIMEOUT_MS
  );
  try {
    const response = await promise;
    if (!response.ok) {
      return { error: await parseErrorResponse(response) };
    }
    const data = await response.json();
    return { code: data.code as string, expiresAt: data.expires_at as string };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { error: "서버 응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요." };
    }
    return { error: "서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요." };
  } finally {
    clearRequestTimeout();
  }
}

export type BackendWardInviteDetail = {
  code: string;
  name: string;
  phone: string;
  guardianName: string | null;
  // 보호자 loginId(=가입 시 email)와 같은 값 — 이 기기의 backendGuardianSessionStore를
  // 바로 찾는 키로 그대로 쓸 수 있다(consent-view.tsx의 guardianLoginId prop).
  guardianLoginId: string | null;
  issuedAt: string;
  expiresAt: string;
};

// GET /wards/invites/{code} — 비로그인 공개 엔드포인트. 어르신 기기가 QR을 스캔하자마자
// 호출한다. 코드가 없거나 만료됐거나 이미 처리됐으면 null.
export async function fetchWardInviteBackend(code: string): Promise<BackendWardInviteDetail | null> {
  const { promise, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    `${API_BASE_URL}/wards/invites/${encodeURIComponent(code)}`,
    {},
    REQUEST_TIMEOUT_MS
  );
  try {
    const response = await promise;
    if (!response.ok) return null;
    const data = await response.json();
    return {
      code: data.code as string,
      name: data.name as string,
      phone: data.phone as string,
      guardianName: (data.guardian_name as string | null) ?? null,
      guardianLoginId: (data.guardian_email as string | null) ?? null,
      issuedAt: data.issued_at as string,
      expiresAt: data.expires_at as string,
    };
  } catch {
    return null;
  } finally {
    clearRequestTimeout();
  }
}

// POST /wards/invites/{code}/consume — 동의(accepted=true) 또는 거절(accepted=false) 시
// 호출. 같은 코드로 다시 들어와도 더는 유효한 초대를 못 찾게 만든다(consumeWardInvite와
// 동일 목적). 소비 자체가 실패해도(네트워크 등) 로컬 가입/거절 흐름은 막지 않는다 — 최악의
// 경우 같은 코드가 서버에서 조금 더 유효해 보이는 정도라, 사용자를 막다른 화면에 가두는
// 것보다 낫다.
export async function consumeWardInviteBackend(code: string, accepted: boolean): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/wards/invites/${encodeURIComponent(code)}/consume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accepted }),
    });
  } catch {
    // 위 주석 참고 — 조용히 무시.
  }
}

// POST /wards/invites/{code}/register — 동의(accepted) 처리된 초대로부터 실제
// User(+건강 프로필)를 만든다. 보호자 토큰이 전혀 필요 없다 — 코드 자체가 서버에
// guardian_id를 이미 들고 있어서, 어르신 기기가 보호자의 백엔드 세션을 빌릴 필요가
// 없다(예전엔 ensureBackendWardId()가 getBackendGuardianSessionForWard()로 이 기기의
// 로컬 세션을 찾았는데, 초대받은 기기엔 그게 애초에 없어서 여기서도 cross-device가
// 막혀 있었다).
//
// 동의 직후가 아니라 질환 설문(/invite/survey)까지 끝난 뒤에 불러야 한다 — 그래야
// condition_flags를 같이 실어 보낼 수 있다(동의 시점엔 아직 설문 전이라 항상 비어
// 나갈 수밖에 없고, 나중에 채워 넣는 API가 없어 그 어르신은 영영 RAG 개인화에서
// 빠지는 문제가 있었다 — consent-view.tsx의 관련 주석 참고). 같은 code로 여러 번
// 불러도 서버가 멱등적으로 처리해서 어르신이 같은 코드가 중복 User를 만들지 않는다.
export async function registerElderFromInviteBackend(
  code: string,
  input: {
    name: string;
    birthDate: string; // "YYYY-MM-DD"
    phone: string;
    address: string;
    planType: string;
    conditionFlags?: string[];
    ttsCallConsent?: boolean;
  }
): Promise<{ userId: string } | { error: string }> {
  const { promise, clearTimeout: clearRequestTimeout } = fetchWithTimeout(
    `${API_BASE_URL}/wards/invites/${encodeURIComponent(code)}/register`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        birth_date: input.birthDate,
        phone: input.phone,
        address: input.address,
        plan_type: input.planType,
        condition_flags: input.conditionFlags ?? [],
        tts_call_consent: input.ttsCallConsent ?? false,
      }),
    },
    REQUEST_TIMEOUT_MS
  );
  try {
    const response = await promise;
    if (!response.ok) {
      return { error: await parseErrorResponse(response) };
    }
    const data = await response.json();
    return { userId: data.user_id as string };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { error: "서버 응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요." };
    }
    return { error: "서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요." };
  } finally {
    clearRequestTimeout();
  }
}
