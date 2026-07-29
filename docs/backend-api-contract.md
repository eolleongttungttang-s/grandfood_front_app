# 백엔드 연동 API 계약 (프론트 목업 기준)

프론트(`grandfood_front_app`)는 아직 실제 백엔드(`grandfood_backend`) 없이, `src/lib/*.ts`의 mock
함수들로 화면을 돌리고 있다. 각 mock 함수 위에는 `TODO(backend): <METHOD> <path>` 주석으로
"이 함수가 나중에 어떤 실제 엔드포인트로 바뀔지"를 표시해뒀는데, 이 문서는 그 주석들을 한 곳에
모은 것이다.

**이 문서의 목적**: 백엔드 팀이 각 도메인을 구현할 때, 프론트가 이미 어떤 타입 모양(필드명)을
기대하고 있는지 미리 알 수 있게 하는 것. 여기 적힌 타입 이름과 필드명은 전부 실제 코드에 있는
그대로이며(지어낸 문서가 아님), 백엔드 응답 스키마를 이 모양에 맞춰주면 프론트는 mock 함수의
**몸통만** 실제 `fetch()` 호출로 바꾸면 되고 호출부(컴포넌트) 코드는 손댈 필요가 없다.

필드명이 이 문서와 다르게 나가야 하는 이유가 있다면(백엔드 컨벤션상), 프론트 쪽 타입/매핑을
바꾸는 게 이 문서를 무시하는 것보다 싸니 — 먼저 상의해서 한쪽에 맞추는 걸 권장한다.

> Money 등 별도 값 객체가 필요한 금액 필드는 지금 프론트엔 없음 (구독 요금(`subscription.ts`)은
> 그냥 원화 정수 `priceWon`으로만 다룸 — 필요시 백엔드의 `Money`처럼 `{amount, currency}`로
> 바꿔도 프론트 쪽 영향은 `subscription.ts` 한 파일뿐).

---

## 1. 반찬 카탈로그 — `src/lib/dishes.ts`

| Method | Path | 설명 |
|---|---|---|
| GET | `/stores/:storeId/dishes` | 파트너 매장이 등록한 반찬 목록 조회 |

```ts
type AllergyTag = "해산물" | "메밀" | "갑각류" | "우유" | "견과류";
type DishCategory = "밥" | "국" | "메인" | "나물" | "김치";

type Dish = {
  id: string;
  storeId: string;
  name: string;
  category: DishCategory;
  kcal: number;
  sodiumMg: number;
  proteinG: number;
  allergyTags: AllergyTag[];
  ingredients: string[];
  imageEmoji: string; // 실제 이미지 URL이 생기면 이 필드를 imageUrl로 바꿔야 함 — 지금은 이모지로 대체 중
};

// Response: Dish[]
```

## 2. AI 반찬 매칭 — `src/lib/recommendation.ts`

| Method | Path | 설명 |
|---|---|---|
| POST | `/wards/:id/recommendations` | "다시 추천받기" — 새 조합 생성 |
| PATCH | `/wards/:id/recommendations/:comboId/items/:dishId` | 반찬 1개를 다른 걸로 교체 (body: `{ replacementDishId: string }`) |

```ts
type DishComboItem = { dishId: string; name: string; kcal: number; sodiumMg: number; proteinG: number };

type DishCombo = {
  comboId: string;
  wardId: string;
  storeId: string;
  items: DishComboItem[];
  totalKcal: number;
  totalSodiumMg: number;
  totalProteinG: number;
  reasons: string[]; // "왜 이 조합인가요" 화면에 그대로 리스트로 표시됨
  matchedAt: string; // ISO datetime
};

// Response (두 엔드포인트 공통): DishCombo
```

## 3. 건강 프로필 등록 — `src/lib/health-profile.ts`

| Method | Path | 설명 |
|---|---|---|
| POST | `/wards/:id/health-profile` | 검진 결과를 텍스트로 직접 입력해 등록 |
| POST | `/wards/:id/health-profile/mydata-link` | 마이데이터(예: 건강보험공단) OAuth 콜백 처리 |

```ts
type HealthProfileSource = "self_reported" | "mydata_linked";

// POST /wards/:id/health-profile 요청 바디 (wardId는 URL 경로에 있으므로 바디엔 안 실어도 됨)
type RegisterHealthProfileCommand = {
  source: HealthProfileSource;
  systolicBP: number;
  fastingGlucose: number;
  hba1c: number;
  weightKg: number;
};

// 두 엔드포인트 공통 Response
type HealthProfileView = RegisterHealthProfileCommand & {
  wardId: string;
  updatedAt: string; // ISO datetime
};
```

## 4. 식사 체크인 · 잔반 분석 — `src/lib/meal-log-store.ts`

| Method | Path | 설명 |
|---|---|---|
| POST | `/wards/:id/meal-logs` | 식전/식후 사진 업로드 (multipart: `beforePhoto`, `afterPhoto`, `mealSlot`) |

```ts
type MealSlot = "아침" | "점심" | "저녁";
type MealLogCompartment = { dishId: string; name: string; leftoverPercent: number };

// Response — 실제로는 비전 모델이 사진을 분석해 칸(compartment)별 잔반율을 계산해서 돌려줌
type MealLogEntry = {
  id: string;
  wardId: string;
  mealSlot: MealSlot;
  loggedAt: string; // ISO datetime
  beforePhotoRef: string | null; // Blob Storage 등 사진 경로/URL
  afterPhotoRef: string | null;
  leftoverRatePercent: number; // 전체 평균 잔반율
  compartments: MealLogCompartment[];
};
```

## 5. 배송 — `src/lib/delivery.ts`

| Method | Path | 설명 |
|---|---|---|
| GET | `/wards/:id/deliveries` | 배송 이력 조회 |

```ts
type DeliveryStatus = "예정" | "완료" | "취소";

type DeliveryRecord = {
  id: string;
  wardId: string;
  storeId: string;
  scheduledDate: string;
  scheduledTime: string;
  status: DeliveryStatus;
  comboId?: string;
};

// Response: DeliveryRecord[]
```

## 6. 레시피 · 유튜브 추천 — `src/lib/recipe-recommendations.ts`

| Method | Path | 설명 |
|---|---|---|
| GET | `/wards/:id/recipe-recommendations?nutrient=...&ingredient=...` | 결핍 영양소 + 잔반 식재료 기반 추천 |

`nutrient`/`ingredient` 쿼리 파라미터는 프론트가 이미 계산해둔 `HealthInsight`(아래 8번,
`health-insights.ts`)의 `deficiencies`/`frequentLeftoverIngredients`에서 옴 — 즉 백엔드는 이
값을 어떻게 계산하는지 몰라도, 프론트가 이미 계산해서 쿼리로 넘겨준다고 가정하면 됨. (다만
장기적으로 이 계산 자체를 백엔드로 옮기고 싶다면 8번 섹션 참고.)

```ts
type NutrientDeficiency = "단백질부족" | "나트륨과다"; // "정상"은 추천 대상이 아니라 쿼리에 안 실림

type RecipeRecommendation = {
  id: string;
  title: string;
  targetNutrient: NutrientDeficiency;
  youtubeUrl: string;
  thumbnailEmoji: string; // 3번 항목의 imageEmoji와 동일한 이유로 나중에 실제 썸네일 URL로 교체 예정
  usesIngredient?: string;
};

// Response: RecipeRecommendation[]
```

## 7. 초대 — `src/lib/invite.ts`, `src/lib/ward-invite.ts`, `src/lib/guardian-invite.ts`

세 가지 서로 다른 초대 흐름이 있음 — 헷갈리지 않도록 구분:

- **어르신 등록 초대** (`ward-invite.ts`): 보호자가 "새 어르신을 시스템에 등록"할 때 발급
- **초대 수락/거절** (`invite.ts`): 어르신이 문자로 받은 링크로 들어와 동의/거절
- **공동 보호자 초대** (`guardian-invite.ts`): 이미 등록된 어르신을 형제자매 등 다른 보호자도
  함께 보게 하는 초대 — 어르신 등록과 무관

| Method | Path | 설명 |
|---|---|---|
| POST | `/wards/invites` | 어르신 등록 초대 발급 (body: `{ name, phone }`) — 서버가 코드 발급 + SMS 발송까지 함께 처리 |
| GET | `/invites/:code` | 문자/QR로 받은 코드로 초대 상세 조회 |
| POST | `/invites/:id/consent` | 어르신이 초대 내용을 확인/수정 후 동의 (body: `InviteFormState`) |
| POST | `/invites/:id/decline` | 어르신이 초대 거절 (DB 삭제 트리거 + 보호자에게 거부 사실만 통보, 사유는 비공개) |
| POST | `/guardians/invites` | 공동 보호자 초대 코드 발급 (body: `{ wardIds: string[] }`) |

```ts
// POST /wards/invites 응답
type WardInviteResult = {
  name: string;
  phone: string;
  code: string;
  issuedAt: string;
  expiresAt: string;
  smsSent: boolean;
};

// GET /invites/:code 응답
type InviteRequest = {
  id: string;
  guardianName: string;
  elderName: string;
  elderPhone: string;
  address: string;
  addressDetail: string;
  sentAt: string;
};

// POST /invites/:id/consent 요청 바디
type InviteFormState = {
  elderName: string;
  elderPhone: string;
  address: string;
  addressDetail: string;
};

// POST /guardians/invites 응답
type GuardianInviteResult = {
  code: string;
  issuedAt: string;
  expiresAt: string;
  wardIds: string[];
};
```

## 8. 참고: 백엔드 엔드포인트가 필요 없는 순수 계산 로직

아래는 이미 받아온 데이터(위 1~7번 응답들)를 클라이언트에서 조합해 계산하는 로직이라, 지금은
TODO(backend) 마커가 없다. 장기적으로 서버 부하를 줄이거나 로직을 통일하고 싶으면 이 계산을
백엔드로 옮길 수도 있지만, 필수는 아니다.

- `src/lib/health-insights.ts`의 `deriveHealthInsight()` — 건강 프로필 + 최근 식사 기록을 합쳐
  영양 결핍/이상 신호(`HealthInsight`)를 판단. 위 6번(레시피 추천)의 쿼리 파라미터가 여기서 나옴.
- `src/lib/reports.ts`의 `getNutritionReport()`, `src/lib/nutrition-tip.ts`의 `getNutritionTip()`
  — 식사 완료율/평균 영양성분 등 리포트용 통계.
