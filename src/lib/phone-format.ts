// 전화번호 입력창에서 숫자만 치면 하이픈을 자동으로 넣어준다. 어르신 서비스 특성상 "010" 치고
// "-"까지 손가락으로 따로 찾아 눌러야 하는 게 불편할 수 있어 만들었다 — 입력할 때마다 그때까지
// 입력된 숫자 개수만 보고 다시 포맷하는 단순한 방식이라, 커서를 문자열 중간에 두고 수정하는
// 경우까지 완벽하게 대응하진 않는다(대부분의 국내 서비스도 이 정도 단순화로 충분히 씀).
export function formatKoreanPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  // 서울 지역번호(02)는 자릿수가 다르다: 2-3-4 또는 2-4-4.
  if (digits.startsWith("02")) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }

  // 휴대폰(010 등)과 그 외 지역번호(031 등) 공통: 3-3-4(10자리) 또는 3-4-4(11자리).
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

// formatKoreanPhoneNumber()가 매 입력마다 문자열을 통째로 재생성해서, 그냥 두면 브라우저가
// 커서를 문자열 끝으로 보내버린다 — 중간 자리(예: 가운데 4자리)를 고치는 사람 입장에선
// 매번 커서를 다시 옮겨야 해서 불편하다(코드 리뷰 지적, 고령층 접근성 기능에서 특히 문제).
// "이전 커서 앞에 숫자가 몇 개 있었는지"를 세서, 포맷 후 같은 숫자 뒤로 커서를 되돌린다 —
// 하이픈 자체는 세지 않으니 하이픈이 느는/주는 것과 무관하게 항상 같은 숫자 뒤에 선다.
export function formatKoreanPhoneNumberWithCursor(
  rawValue: string,
  cursorPos: number
): { formatted: string; cursor: number } {
  const digitsBeforeCursor = rawValue.slice(0, cursorPos).replace(/\D/g, "").length;
  const formatted = formatKoreanPhoneNumber(rawValue);

  if (digitsBeforeCursor === 0) return { formatted, cursor: 0 };

  let seenDigits = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) {
      seenDigits++;
      if (seenDigits === digitsBeforeCursor) {
        return { formatted, cursor: i + 1 };
      }
    }
  }
  return { formatted, cursor: formatted.length };
}
