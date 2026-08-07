// fetch에 타임아웃을 붙이는 공용 헬퍼. accessibility.ts(speakRaw)와 rag-chat.ts
// (askHealthQuestion) 양쪽에 거의 같은 AbortController+setTimeout 패턴이 각자 있었는데,
// 그중 하나가 "fetch()가 헤더를 받자마자 clearTimeout을 호출해서, 그 뒤 response.blob()/
// json()으로 바디를 읽는 동안은 타임아웃이 더 이상 안 걸리는" 버그를 갖고 있었다 — 백엔드가
// 헤더는 빨리 응답하고 바디 스트리밍만 멈추면 사실상 무기한 대기하게 되는 문제. 한 곳에만
// 있으면 한 번만 고치면 되게 여기로 모은다.
//
// 타이머는 호출부가 바디까지 다 읽고 clearTimeout()을 직접 불러줄 때까지 살아있는다 —
// 그래야 바디 다운로드 중 멈추는 경우도 타임아웃이 커버한다.
//
// async 함수가 아니라 controller를 "즉시(동기적으로)" 반환한다 — accessibility.ts처럼
// "이 요청을 나중에 외부에서(다른 카드가 연달아 탭됐을 때) 취소할 수도 있어야 하는" 호출부는
// fetch가 아직 끝나기 전부터 controller 참조를 들고 있어야 한다. await 뒤에야 controller를
// 돌려주면, fetch가 진행 중인 동안 들어온 새 요청이 이전 요청을 취소할 방법이 없는 시간차가
// 생긴다.
export function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): { promise: Promise<Response>; controller: AbortController; clearTimeout: () => void } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const promise = fetch(url, { ...options, signal: controller.signal });
  return { promise, controller, clearTimeout: () => clearTimeout(timeoutId) };
}
