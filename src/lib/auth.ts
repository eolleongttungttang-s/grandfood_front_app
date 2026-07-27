export type UserRole = "user" | "guardian";

export type Account = {
  loginId: string;
  password: string;
  role: UserRole;
  /** 조직 · 구분 표기 (예: 개인 이용자 / 가족 보호자) */
  org: string;
  name: string;
  phone: string;
  /** role === "user" 인 경우 본인의 대상자 레코드 id */
  selfWardId?: string;
  /** role === "guardian" 인 경우 돌보는 대상자 id 목록 */
  wardIds?: string[];
};

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

export function findAccount(loginId: string, password: string): Account | null {
  const account = ACCOUNTS.find((a) => a.loginId === loginId);
  if (!account || account.password !== password) return null;
  return account;
}
