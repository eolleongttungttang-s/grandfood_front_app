export type WardStatus = "확인 필요" | "관찰중" | "양호";
export type MealTone = "완식" | "소량" | "미응답";

export type Ward = {
  id: string;
  name: string;
  age: number;
  gender: "여" | "남";
  address: string;
  facility: string;
  /** 보호자 화면에서 보여줄 관계 표기 (본인 화면에서는 사용하지 않음) */
  relationToGuardian: string;
  /** 여러 부모님(양가)을 등록해 관리하는 경우 구분용 그룹명 */
  familyGroup: string;
  /** 이 대상자를 함께 보고 있는 다른 보호자 (형제자매 등 가족 공유) */
  coGuardians: string[];
  conditions: string[];
  status: WardStatus;
  lastMeal: { tone: MealTone; label: string };
  caseWorkerName: string;
  caseWorkerPhone: string;
};

export const WARDS: Ward[] = [
  {
    id: "001",
    name: "박순자",
    age: 82,
    gender: "여",
    address: "역삼1동",
    facility: "강남구 노인맞춤돌봄센터",
    relationToGuardian: "어머니",
    familyGroup: "본가",
    coGuardians: ["박은정 (딸)"],
    conditions: ["고혈압", "당뇨"],
    status: "확인 필요",
    lastMeal: { tone: "미응답", label: "3일째 미응답" },
    caseWorkerName: "김미정 사회복지사",
    caseWorkerPhone: "02-3423-1000",
  },
  {
    id: "006",
    name: "한상옥",
    age: 88,
    gender: "여",
    address: "청담동",
    facility: "강남구 노인맞춤돌봄센터",
    relationToGuardian: "할머니",
    familyGroup: "본가",
    coGuardians: [],
    conditions: ["치매 초기", "당뇨"],
    status: "확인 필요",
    lastMeal: { tone: "미응답", label: "4일째 미응답" },
    caseWorkerName: "박정현 주무관",
    caseWorkerPhone: "02-3423-1002",
  },
  {
    id: "008",
    name: "윤태식",
    age: 91,
    gender: "남",
    address: "대치2동",
    facility: "강남구 노인맞춤돌봄센터",
    relationToGuardian: "할아버지",
    familyGroup: "처가",
    coGuardians: ["윤서연 (아내)"],
    conditions: ["심부전", "고혈압"],
    status: "관찰중",
    lastMeal: { tone: "소량", label: "어제 소량 섭취" },
    caseWorkerName: "박정현 주무관",
    caseWorkerPhone: "02-3423-1002",
  },
];

export function getWard(id: string): Ward | undefined {
  return WARDS.find((w) => w.id === id);
}

export type MenuItem = { id: string; name: string };

export type WardDetail = {
  allergies: string[];
  medications: { name: string; schedule: string }[];
  chewingNote: string;
  checkup: {
    date: string;
    systolicBP: number;
    fastingGlucose: number;
    hba1c: number;
    weightKg: number;
  };
  diet: {
    name: string;
    sodiumMg: number;
    proteinG: number;
    kcal: number;
    reasons: string[];
  };
  /** 오늘의 배달 식단 사진(이모지로 대체)과 메뉴 구성 */
  todayMenu: { photoEmoji: string; items: MenuItem[] };
  /** 오늘 배송 도착 예정 시각 */
  deliveryEta: string;
  /** 오늘 잔반율(%) — 최근 응답 상태에서 추정 */
  leftoverPercent: number;
  mealHistory: MealTone[];
  nextVisit: { date: string; worker: string; type: "방문" | "전화" } | null;
  visitHistory: { date: string; worker: string; type: "방문" | "전화" }[];
};

function seed(id: string) {
  let s = 0;
  for (const ch of id) s += ch.charCodeAt(0);
  return s;
}

const ALLERGY_POOL = ["없음", "고등어(해산물)", "메밀", "갑각류", "우유", "견과류"];

const MENU_POOL: Record<string, { photoEmoji: string; items: string[] }> = {
  "저염 · 단백강화 당뇨식": {
    photoEmoji: "🍱",
    items: ["잡곡밥", "두부조림", "시금치나물", "저염된장국", "배추김치"],
  },
  "저염 관리형 식단": {
    photoEmoji: "🍚",
    items: ["잡곡밥", "고등어구이", "나물무침", "저염된장국", "깍두기"],
  },
  "저염 · 저지방 관리식": {
    photoEmoji: "🥗",
    items: ["현미밥", "닭가슴살찜", "브로콜리나물", "맑은무국", "배추김치"],
  },
  "일반 균형식": {
    photoEmoji: "🍛",
    items: ["흰쌀밥", "제육볶음", "시금치나물", "미역국", "깍두기"],
  },
};

export function getWardDetail(ward: Ward): WardDetail {
  const s = seed(ward.id);
  const has = (keyword: string) => ward.conditions.some((c) => c.includes(keyword));
  const allergies = [ALLERGY_POOL[s % ALLERGY_POOL.length]];

  const medications: { name: string; schedule: string }[] = [];
  if (has("고혈압")) medications.push({ name: "암로디핀 5mg", schedule: "1일 1회 · 아침" });
  if (has("당뇨")) medications.push({ name: "메트포르민 500mg", schedule: "1일 2회 · 식후" });
  if (has("심부전")) medications.push({ name: "이뇨제", schedule: "1일 1회 · 아침" });
  if (medications.length === 0)
    medications.push({ name: "특이 복약 없음", schedule: "-" });

  const chewingNote =
    ward.age >= 85
      ? "틀니 사용 · 질긴 육류는 다짐육으로 대체하고 있어요"
      : ward.age >= 80
        ? "일반식 가능 · 질긴 음식만 주의하고 있어요"
        : "저작 · 연하 상태 정상이에요";

  const systolicBP = 118 + (has("고혈압") ? 24 : 0) + (s % 7);
  const fastingGlucose = 92 + (has("당뇨") ? 34 : 0) + (s % 10);
  const hba1c = Number((5.6 + (has("당뇨") ? 1.3 : 0) + (s % 5) * 0.1).toFixed(1));
  const weightKg =
    (ward.gender === "여" ? 54 : 66) - Math.max(0, ward.age - 75) * 0.3;

  const dietName = has("심부전")
    ? "저염 · 저지방 관리식"
    : has("당뇨")
      ? "저염 · 단백강화 당뇨식"
      : has("고혈압")
        ? "저염 관리형 식단"
        : "일반 균형식";

  const sodiumMg = has("고혈압") || has("당뇨") || has("심부전") ? 1500 : 1800;
  const proteinG = ward.status === "확인 필요" ? 68 : 58;
  const kcal = 1550 + (s % 4) * 30;

  const reasons: string[] = [];
  if (has("고혈압"))
    reasons.push(`수축기 ${systolicBP}mmHg → 나트륨 1일 ${sodiumMg}mg 이하로 제한하고 있어요`);
  if (has("당뇨"))
    reasons.push(`공복혈당 ${fastingGlucose}mg/dL → 단순당을 줄이고 잡곡 위주로 구성했어요`);
  if (has("심부전")) reasons.push("수분 · 나트륨 제한이 필요해 국물류를 줄였어요");
  if (allergies[0] !== "없음")
    reasons.push(`${allergies[0]} 알레르기 → 대체 단백원(닭가슴살 · 두부)으로 바꿨어요`);
  if (reasons.length === 0) reasons.push("특별한 위험 요인이 없어 표준 균형식을 유지하고 있어요");

  const tailCount =
    ward.lastMeal.tone === "미응답" ? 3 : ward.lastMeal.tone === "소량" ? 2 : 0;
  const mealHistory: MealTone[] = [];
  for (let i = 0; i < 14; i++) {
    if (i >= 14 - tailCount) {
      mealHistory.push(ward.lastMeal.tone);
    } else {
      mealHistory.push((s + i) % 5 === 0 ? "소량" : "완식");
    }
  }

  const nextVisit =
    ward.status === "확인 필요"
      ? { date: "2026.07.28", worker: ward.caseWorkerName, type: "방문" as const }
      : ward.status === "관찰중"
        ? { date: "2026.08.02", worker: ward.caseWorkerName, type: "전화" as const }
        : null;

  const visitHistory = [
    { date: "2026.07.20", worker: ward.caseWorkerName, type: "방문" as const },
    { date: "2026.07.06", worker: ward.caseWorkerName, type: "전화" as const },
    ...(nextVisit ? [nextVisit] : []),
  ];

  const menu = MENU_POOL[dietName] ?? MENU_POOL["일반 균형식"];
  const todayMenu = {
    photoEmoji: menu.photoEmoji,
    items: menu.items.map((name, i) => ({ id: `${ward.id}-menu-${i}`, name })),
  };

  const deliveryEta = ward.status === "확인 필요" ? "12:30" : "12:00";

  const leftoverPercent =
    ward.lastMeal.tone === "미응답" ? 100 : ward.lastMeal.tone === "소량" ? 55 : 5;

  return {
    allergies,
    medications,
    chewingNote,
    checkup: {
      date: "2026.05.14",
      systolicBP,
      fastingGlucose,
      hba1c,
      weightKg: Number(weightKg.toFixed(1)),
    },
    diet: { name: dietName, sodiumMg, proteinG, kcal, reasons },
    todayMenu,
    deliveryEta,
    leftoverPercent,
    mealHistory,
    nextVisit,
    visitHistory,
  };
}
