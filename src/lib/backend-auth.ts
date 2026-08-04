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

  const session = getBackendGuardianSessionForWard(params.mockWardId);
  if (!session) return null;

  const currentYear = new Date().getFullYear();
  try {
    const response = await fetch(`${API_BASE_URL}/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({
        name: params.name,
        birth_date: `${currentYear - params.age}-01-01`,
        phone: "000-0000-0000",
        address: params.address,
        plan_type: "base",
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const userId: string = data.user_id;
    backendWardIdMapStore.update((prev) => ({ ...prev, [params.mockWardId]: userId }));
    return userId;
  } catch {
    return null;
  }
}
