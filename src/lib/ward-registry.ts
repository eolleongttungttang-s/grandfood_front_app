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
  return WARDS.find((w) => w.id === id);
}
