"use client";

import { Button } from "@/components/ui/button";

// 팀 합의안 3번 — "AI 추천받기"를 누르기 전에 뜨는 리마인드. 합의안 4번에서 "상태값
// 구분(진짜 없음 vs 온보딩 때 답 안 함) 없이, 이미 입력한 사람에게도 다시 한번 확인해
// 달라는 리마인드 문구로 띄우자"로 정리됐기 때문에, 이 모달은 "정보가 없습니다"라고
// 확정적으로 말하지 않고 "확인해 주세요"로 문구를 둔다 — 실제로는 입력을 마친 사람한테도
// 뜰 수 있는 문구다.
export function RecommendationReminderModal({
  open,
  onEditInfo,
  onProceedAnyway,
  onClose,
}: {
  open: boolean;
  /** "수정하러 가기" — 호출부가 알레르기/복약 설문 화면으로 라우팅한다. */
  onEditInfo: () => void;
  /** "그대로 진행하기" — 호출부가 원래 하려던 추천 요청(request())을 이어서 부른다. */
  onProceedAnyway: () => void;
  /** 바깥 영역 클릭으로 닫을 때 — 이땐 추천 요청을 부르지 않는다(진행도 취소도 아닌
   *  "그냥 닫기"). */
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1.5">
          <h3 className="text-lg font-bold text-foreground">잠깐만요!</h3>
          <p className="text-sm text-muted-foreground">
            알레르기 · 복약 정보에 따라 추천 결과가 달라져요. 지금 등록된 정보가 맞는지
            한 번 확인해 주시겠어요?
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onEditInfo}>
            수정하러 가기
          </Button>
          <Button className="flex-1" onClick={onProceedAnyway}>
            그대로 진행하기
          </Button>
        </div>
      </div>
    </div>
  );
}
