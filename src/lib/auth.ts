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

export function getAccounts(): Account[] {
  return [...ACCOUNTS, ...readRegisteredAccounts()];
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
      ? { birthDate: command.birthDate, address, planType: command.planType ?? "basic" }
      : {}),
    ...(command.role === "user"
      ? { selfWardId: command.selfWardId }
      : { wardIds: command.wardIds?.filter(Boolean) ?? [] }),
  };

  writeRegisteredAccounts([...readRegisteredAccounts(), account]);
  return { account };
}
