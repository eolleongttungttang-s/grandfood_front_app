import { createLocalStore } from "@/lib/local-store";

// 이용자(어르신 본인) 최초 회원가입 직후 온보딩 튜토리얼(/user/tutorial)을 한 번만
// 보여주기 위한 완료 여부 저장소. loginId 기준으로 기록해서, 같은 계정이 나중에 이
// 경로로 다시 들어와도(브라우저 뒤로가기 등) 곧장 홈으로 돌려보낼 수 있다.
const userTutorialSeenStore = createLocalStore<Record<string, boolean>>(
  "grandfood-app-user-tutorial-seen",
  {}
);

export function hasSeenUserTutorial(loginId: string): boolean {
  return userTutorialSeenStore.read()[loginId] === true;
}

export function markUserTutorialSeen(loginId: string): void {
  userTutorialSeenStore.update((prev) => ({ ...prev, [loginId]: true }));
}
