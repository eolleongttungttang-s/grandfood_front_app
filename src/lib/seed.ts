// 문자열(id)을 결정적(deterministic)인 숫자로 바꿔주는 아주 단순한 해시 함수.
// Math.random()을 쓰면 새로고침할 때마다 같은 ward의 mock 데이터가 바뀌어 버리는데,
// 그러면 "이 어르신은 항상 이 조합을 추천받는다" 같은 화면 간 일관성이 깨진다.
// id 문자 코드 합만 쓰는 아주 단순한 방식이라 진짜 해시 함수는 아니지만,
// 목업 데이터를 재현 가능하게 만드는 용도로는 이 정도로 충분하다.
export function seedFromId(id: string): number {
  let s = 0;
  for (const ch of id) s += ch.charCodeAt(0);
  return s;
}
