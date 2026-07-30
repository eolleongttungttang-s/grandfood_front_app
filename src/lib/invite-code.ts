// 초대 코드 생성 로직. 원래 ward-invite.ts 안에 있었는데, guardian-profile-view.tsx도
// 똑같은 로직을 자체적으로 복사해서 쓰고 있었다(공동 보호자 초대용). "어르신 초대"와
// "공동 보호자 초대"는 서로 다른 기능이지만 코드 생성 방식까지 다를 이유는 없어서 공통 유틸로 뺐다.

// 혼동되기 쉬운 문자(I, O, 0, 1)는 제외
const INVITE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const INVITE_VALID_DAYS = 7;

export function generateInviteCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += INVITE_CODE_CHARS[Math.floor(Math.random() * INVITE_CODE_CHARS.length)];
  }
  return code;
}
