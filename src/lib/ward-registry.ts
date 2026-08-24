// Ward 타입 + 대상자 목록(WARDS)만 따로 뺀 "가벼운" 파일.
//
// 왜 따로 뺐는가: `generateStaticParams()`는 빌드 시점에 Node(서버)에서 실행되는데,
// wards.ts는 이제 건강 프로필·배송 같은 브라우저 저장소(local-store.ts, "use client")에
// 의존한다. wards.ts를 서버 코드에서 그대로 import하면 그 의존성까지 전부 로드되면서
// "클라이언트 전용 함수를 서버에서 호출했다"는 빌드 에러가 난다. 반면 어떤 대상자가
// 존재하는지(Ward/WARDS/getWard)는 store 없이도 알 수 있는 순수 데이터라서, 이 부분만
// 여기로 분리해 서버 쪽 generateStaticParams가 wards.ts의 무거운 나머지를 안 건드리게 했다.

export type WardStatus = "확인 필요" | "관찰중" | "양호";
export type MealTone = "완식" | "소량" | "미응답";

export type Ward = {
  id: string;
  name: string;
  age: number;
  gender: "여" | "남";
  address: string;
  /** 담당 반찬가게. B2G 버전의 facility/caseWorker(정부 시설·사회복지사)를 대체 —
   *  문의도 이제 이 매장으로 하면 된다 (partner-stores.ts 참고). */
  partnerStoreId: string;
  /** 보호자 화면에서 보여줄 관계 표기 (본인 화면에서는 사용하지 않음) */
  relationToGuardian: string;
  /** 여러 부모님(양가)을 등록해 관리하는 경우 구분용 그룹명 */
  familyGroup: string;
  /** 이 대상자를 함께 보고 있는 다른 보호자 (형제자매 등 가족 공유) */
  coGuardians: string[];
  conditions: string[];
  status: WardStatus;
  lastMeal: { tone: MealTone; label: string };
};

const REGISTERED_WARDS_KEY = "grandfood-app-registered-wards";

// 신규 초대로 가입한 어르신의 표시용 필드 기본값. 진단/이력 데이터가 아직 없는
// 상태라, 보호자 화면에서 "정보 없음"이 아니라 자연스러운 초기 상태로 보이게 한다.
const NEW_WARD_DEFAULTS = {
  relationToGuardian: "가족",
  familyGroup: "본가",
  coGuardians: [] as string[],
  conditions: [] as string[],
  status: "확인 필요" as WardStatus,
  lastMeal: { tone: "미응답" as MealTone, label: "아직 식사 기록이 없어요" },
};

export function newWardDefaults() {
  return NEW_WARD_DEFAULTS;
}

// 배송 도메인 자체가 백엔드에 없어서(grandfood_backend GET /wards/{id}/deliveries조차
// "실제 주문/배송 도메인이 없어 목업 값을 채워 넣는다"고 명시함) 이 값은 처음부터 실측이
// 아니라 대상자 상태값 하나로 대충 고른 자리표시자다. 그래서 홈 화면에 "오늘 점심 배송
// 예정 · 12:00"처럼 정밀한 시각으로 상시 노출하지 않고(2026-08-24 피드백, "이거 완전
// 목업이지?"), notifications.ts가 완식 스트릭과 같은 방식(프론트 합성 알림)으로 알림
// 목록에 하루 한 번만 띄운다 — wards.ts(getWardDetail)와 notifications.ts 둘 다 같은
// 값을 써야 해서 여기 한 곳에만 둔다.
export function estimateDeliveryEta(status: WardStatus): string {
  return status === "확인 필요" ? "12:30" : "12:00";
}

function readRegisteredWards(): Ward[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(REGISTERED_WARDS_KEY);
    const wards = stored ? (JSON.parse(stored) as unknown) : [];
    return Array.isArray(wards) ? (wards as Ward[]) : [];
  } catch {
    return [];
  }
}

function writeRegisteredWards(wards: Ward[]) {
  window.localStorage.setItem(REGISTERED_WARDS_KEY, JSON.stringify(wards));
}

// 정적 목업 3명 + 실제 초대로 새로 등록된 ward를 합쳐서 돌려준다 (auth.ts의
// ACCOUNTS/getAccounts()와 동일한 패턴 — 빌드 타임 generateStaticParams는
// WARDS만 보고, 런타임 조회는 이 merge된 목록을 쓴다). registeredWards에 정적
// WARDS와 같은 id가 있으면(updateWard가 정적 목업을 수정할 때 만드는 override
// 엔트리) 그게 우선하도록 뒤에 둔다 — getWard()가 Array.find로 첫 매치를
// 돌려주므로, 여기 순서가 곧 "누가 이긴다"를 결정한다.
export function getWards(): Ward[] {
  const registered = readRegisteredWards();
  const overriddenIds = new Set(registered.map((w) => w.id));
  return [...WARDS.filter((w) => !overriddenIds.has(w.id)), ...registered];
}

export function addWard(ward: Ward): void {
  writeRegisteredWards([...readRegisteredWards(), ward]);
}

// 프로필 화면의 "기본 정보 수정하기"가 쓴다 — 정적 WARDS 목업(001/006/008)을 수정하려는
// 경우엔 원본 배열을 못 건드리니, registeredWards에 같은 id로 override 엔트리를 새로
// 만들어 그걸로 대체한다(위 getWards() 주석 참고). 이미 registeredWards에 있는(자가등록)
// ward라면 그 자리를 그대로 갱신한다.
//
// 로컬 전용 업데이트다 — 백엔드 PATCH /users/{id}는 아직 tts_call_consent만 받고
// address/birth_date는 안 받는다(backend account/router.py 주석 참고), 그래서 여기서
// 고친 값은 이 브라우저에만 남고 서버엔 반영되지 않는다.
export function updateWard(id: string, patch: Partial<Omit<Ward, "id">>): void {
  const registered = readRegisteredWards();
  const existingIndex = registered.findIndex((w) => w.id === id);
  if (existingIndex !== -1) {
    const next = [...registered];
    next[existingIndex] = { ...next[existingIndex], ...patch };
    writeRegisteredWards(next);
    return;
  }

  const base = WARDS.find((w) => w.id === id);
  if (!base) return;
  writeRegisteredWards([...registered, { ...base, ...patch }]);
}

export const WARDS: Ward[] = [
  {
    id: "001",
    name: "박순자",
    age: 82,
    gender: "여",
    address: "역삼1동",
    partnerStoreId: "store-yeoksam",
    relationToGuardian: "어머니",
    familyGroup: "본가",
    coGuardians: ["박은정 (딸)"],
    conditions: ["고혈압", "당뇨"],
    status: "확인 필요",
    lastMeal: { tone: "미응답", label: "3일째 미응답" },
  },
  {
    id: "006",
    name: "한상옥",
    age: 88,
    gender: "여",
    address: "청담동",
    partnerStoreId: "store-cheongdam",
    relationToGuardian: "할머니",
    familyGroup: "본가",
    coGuardians: [],
    conditions: ["치매 초기", "당뇨"],
    status: "확인 필요",
    lastMeal: { tone: "미응답", label: "4일째 미응답" },
  },
  {
    id: "008",
    name: "윤태식",
    age: 91,
    gender: "남",
    address: "대치2동",
    partnerStoreId: "store-daechi",
    relationToGuardian: "할아버지",
    familyGroup: "처가",
    coGuardians: ["윤서연 (아내)"],
    conditions: ["심부전", "고혈압"],
    status: "관찰중",
    lastMeal: { tone: "소량", label: "어제 소량 섭취" },
  },
];

export function getWard(id: string): Ward | undefined {
  return getWards().find((w) => w.id === id);
}
