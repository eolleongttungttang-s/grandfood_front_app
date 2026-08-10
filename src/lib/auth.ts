import { createLocalStore } from "@/lib/local-store";

export type UserRole = "user" | "guardian";

export type Account = {
  loginId: string;
  password: string;
  role: UserRole;
  /** 조직 · 구분 표기 (예: 개인 이용자 / 가족 보호자) */
  org: string;
  name: string;
  phone: string;
  /** 보호자 계정의 로그인 이메일. 기존 데모 계정은 loginId를 유지한다. */
  email?: string;
  /** 대상자와의 관계. 보호자 가입 시 입력받는다. */
  relationship?: string;
  /** 이용자 가입 시 받는 기본 프로필 정보. */
  birthDate?: string;
  address?: string;
  planType?: string;
  /** role === "user" 인 경우 본인의 대상자 레코드 id */
  selfWardId?: string;
  /** role === "guardian" 인 경우 돌보는 대상자 id 목록 */
  wardIds?: string[];
  /** role === "user"(어르신 본인)만 해당 — 안부확인콜(TTS) 동의 여부.
   *  TODO(backend): UserModel에 해당 컬럼이 생기면 POST /users 요청 바디에 실어 보내야 함
   *  (지금은 백엔드에 저장할 자리가 없어서 로컬에만 둠 — docs/backend-api-contract.md 참고). */
  ttsCallConsent?: boolean;
};

export type RegisterAccountCommand = {
  loginId: string;
  password: string;
  role: UserRole;
  name: string;
  phone: string;
  email?: string;
  relationship?: string;
  birthDate?: string;
  address?: string;
  planType?: string;
  selfWardId?: string;
  wardIds?: string[];
  ttsCallConsent?: boolean;
};

export type RegisterAccountResult =
  | { account: Account }
  | { error: string };

const REGISTERED_ACCOUNTS_STORAGE_KEY = "grandfood-app-accounts";

export const ACCOUNTS: Account[] = [
  {
    loginId: "gf-user01",
    password: "1234",
    role: "user",
    org: "개인 이용자",
    name: "박순자",
    phone: "010-2938-1204",
    selfWardId: "001",
  },
  {
    loginId: "gf-guardian01",
    password: "1234",
    role: "guardian",
    org: "가족 · 보호자",
    name: "박지훈",
    phone: "010-2938-5567",
    wardIds: ["001", "006", "008"],
  },
];

function readRegisteredAccounts(): Account[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(REGISTERED_ACCOUNTS_STORAGE_KEY);
    const accounts = stored ? (JSON.parse(stored) as unknown) : [];
    return Array.isArray(accounts) ? (accounts as Account[]) : [];
  } catch {
    return [];
  }
}

function writeRegisteredAccounts(accounts: Account[]) {
  window.localStorage.setItem(REGISTERED_ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
}

// 안부확인콜 동의는 가입 시점에만 정해지는 게 아니라 마이페이지에서 나중에 바꿀 수 있어야
// 하고, 보호자가 초대로 새 대상자를 등록시켜도 그 id가 보호자 자신의 wardIds엔 반영 안 되는
// 문제가 있었다. 둘 다 "ACCOUNTS(목업 3명)는 고정 배열이라 직접 수정 불가, registerAccount()로
// 새로 가입한 계정도 매번 통째로 다시 쓰기엔 무거움" 이라는 같은 이유로 loginId 기준
// "덮어쓰기 오버레이"를 localStorage에 따로 저장해뒀다가 getAccounts()에서 얹어주는
// 패턴을 쓴다. 읽기/쓰기 자체는 local-store.ts의 createLocalStore가 이미 구현해뒀으니 그걸
// 재사용한다 (SSR 가드·JSON 파싱 실패 처리까지 한 곳에서만 관리됨).
const ttsConsentOverridesStore = createLocalStore<Record<string, boolean>>(
  "grandfood-app-tts-consent-overrides",
  {}
);

export function updateAccountTtsCallConsent(loginId: string, consent: boolean): void {
  ttsConsentOverridesStore.update((prev) => ({ ...prev, [loginId]: consent }));
}

const wardLinkOverridesStore = createLocalStore<Record<string, string[]>>(
  "grandfood-app-guardian-ward-links",
  {}
);

export function linkWardToGuardian(guardianLoginId: string, wardId: string): void {
  wardLinkOverridesStore.update((prev) => {
    const existing = prev[guardianLoginId] ?? [];
    if (existing.includes(wardId)) return prev;
    return { ...prev, [guardianLoginId]: [...existing, wardId] };
  });
}

export function getAccounts(): Account[] {
  const ttsOverrides = ttsConsentOverridesStore.read();
  const wardLinkOverrides = wardLinkOverridesStore.read();
  return [...ACCOUNTS, ...readRegisteredAccounts()].map((account) => {
    let next = account;
    if (account.loginId in ttsOverrides) {
      next = { ...next, ttsCallConsent: ttsOverrides[account.loginId] };
    }
    const linkedWardIds = wardLinkOverrides[account.loginId];
    if (next.role === "guardian" && linkedWardIds?.length) {
      next = { ...next, wardIds: [...new Set([...(next.wardIds ?? []), ...linkedWardIds])] };
    }
    return next;
  });
}

// 이 브라우저엔 로컬 계정이 없지만(다른 기기에서 가입했거나 저장소가 지워짐) 실제 백엔드
// 로그인엔 성공한 보호자를 위해, 이 기기에도 로컬 계정을 만들어준다 — login/page.tsx의
// 크로스디바이스 폴백 로그인에서만 쓴다. 이미 있으면 아무것도 안 한다(이 경로를 타는 건
// 애초에 findAccountByLoginId가 실패했을 때뿐이라 보통 없겠지만, 방어적으로 확인).
//
// wardIds는 빈 배열로 시작한다 — 이 보호자가 실제로 관리하는 대상자 목록은 로컬 저장소에만
// 있는 정보라(초대 동의 시 linkWardToGuardian으로 기록됨), 백엔드엔 "내 대상자 목록 조회"
// API가 없어서 여기서 복구할 방법이 없다. 로그인은 되지만 보호자 홈이 빈 상태로 시작하는
// 것까진 이번 수정의 범위 밖(백엔드에 대상자 목록 API가 생기면 그때 채울 수 있다).
export function ensureLocalGuardianAccount(params: {
  loginId: string;
  password: string;
  name: string;
  phone: string;
  relationship: string;
}): void {
  const existing = findAccountByLoginId(params.loginId);
  if (existing) {
    // 로컬에 남은 비밀번호가 방금 백엔드 로그인에 성공한 비밀번호와 다르면(다른 기기에서
    // 비밀번호를 바꾼 경우 등) 여기서 갱신 안 해두면, 이후 login()은 계속 옛 로컬 비밀번호와만
    // 비교해서 정확한 비밀번호를 넣어도 로컬 로그인이 영구히 실패한다. wardIds 등 로컬에만
    // 있는 다른 정보는 덮어쓰지 않고 비밀번호만 최신화한다.
    if (existing.password !== params.password) {
      writeRegisteredAccounts(
        readRegisteredAccounts().map((account) =>
          account.loginId === params.loginId ? { ...account, password: params.password } : account
        )
      );
    }
    return;
  }

  const account: Account = {
    loginId: params.loginId,
    password: params.password,
    role: "guardian",
    org: "가족 · 보호자",
    name: params.name,
    phone: params.phone,
    email: params.loginId,
    relationship: params.relationship,
    wardIds: [],
  };
  writeRegisteredAccounts([...readRegisteredAccounts(), account]);
}

export function findAccountByLoginId(loginId: string): Account | null {
  return getAccounts().find((account) => account.loginId === loginId) ?? null;
}

export function findAccount(loginId: string, password: string): Account | null {
  const account = findAccountByLoginId(loginId);
  if (!account || account.password !== password) return null;
  return account;
}

// TODO(backend): 회원가입 API가 준비되면 localStorage 대신 서버에서 중복 검사와 비밀번호 해싱을 수행한다.
export function registerAccount(command: RegisterAccountCommand): RegisterAccountResult {
  const loginId = (command.role === "guardian" ? command.email ?? "" : command.loginId).trim();
  const name = command.name.trim();
  const phone = command.phone.trim();
  const relationship = command.relationship?.trim();
  const address = command.address?.trim();

  if (command.role === "guardian" && !/^\S+@\S+\.\S+$/.test(loginId)) {
    return { error: "올바른 이메일 주소를 입력해 주세요." };
  }
  if (command.role === "user" && !/^[a-zA-Z0-9가-힣-]{2,30}$/.test(loginId)) {
    return { error: "아이디를 2~30자로 입력해 주세요." };
  }
  if (findAccountByLoginId(loginId)) return { error: "이미 사용 중인 아이디예요." };
  if (name.length < 2) return { error: "이름을 2자 이상 입력해 주세요." };
  // 보호자는 실제 백엔드(grandfood_backend, GuardianRegisterRequest)가 8자 이상을 요구하므로
  // 여기서도 똑같이 맞춘다 — 그래야 로컬 가입과 백엔드 가입이 항상 같이 성공/실패한다.
  const minPasswordLength = command.role === "guardian" ? 8 : 4;
  if (command.password.length < minPasswordLength) {
    return { error: `비밀번호를 ${minPasswordLength}자 이상 입력해 주세요.` };
  }
  if (!phone) return { error: "전화번호를 입력해 주세요." };
  if (command.role === "guardian" && !relationship) {
    return { error: "대상자와의 관계를 입력해 주세요." };
  }
  if (command.role === "user" && !command.selfWardId) {
    if (!command.birthDate) return { error: "생년월일을 입력해 주세요." };
    if (!address) return { error: "주소를 입력해 주세요." };
  }

  const account: Account = {
    loginId,
    password: command.password,
    role: command.role,
    org: command.role === "user" ? "개인 이용자" : "가족 · 보호자",
    name,
    phone,
    ...(command.role === "guardian" ? { email: loginId, relationship } : {}),
    ...(command.role === "user"
      ? {
          birthDate: command.birthDate,
          address,
          planType: command.planType ?? "basic",
          ttsCallConsent: command.ttsCallConsent ?? false,
        }
      : {}),
    ...(command.role === "user"
      ? { selfWardId: command.selfWardId }
      : { wardIds: command.wardIds?.filter(Boolean) ?? [] }),
  };

  writeRegisteredAccounts([...readRegisteredAccounts(), account]);
  return { account };
}
