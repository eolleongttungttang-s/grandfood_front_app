"use client";

import { API_BASE_URL } from "@/lib/api-config";

const JUSO_CONFM_KEY = process.env.NEXT_PUBLIC_JUSO_CONFM_KEY ?? "";
const JUSO_POPUP_URL = "https://www.juso.go.kr/addrlink/addrLinkUrl.do";

export type JusoAddressResult = {
  roadAddr: string;
  /** 아파트 등 공동주택을 고르면 팝업이 자체적으로 한 번 더 물어보는 동/호수 — 사용자가
   *  실제로 "상세주소"라고 인식하는 값이 바로 이거다(2026-08-26 피드백). */
  addrDetail: string;
  extraAddr: string;
  jibunAddr: string;
  zipNo: string;
};

// 행정안전부 도로명주소 팝업 API 연동. 팝업에서 사용자가 주소를 고르면 juso.go.kr 서버가
// returnUrl로 폼 POST를 보내는데, 이 앱은 output:"export"(정적 HTML)라 그 POST를 직접
// 받을 서버가 없다 — 그래서 returnUrl을 grandfood_backend의 /address/juso-callback(POST를
// 대신 받아 이 창의 opener에 postMessage로 넘겨주는 다리 역할, DB 접근 없음)으로 지정한다.
// 팝업이 우리 프론트와 다른 오리진(백엔드 도메인)에서 메시지를 보내므로, event.origin이
// 그 백엔드 오리진과 일치할 때만 받아들인다 — 다른 곳에서 위조한 postMessage를 걸러낸다.
export function openJusoAddressSearch(onSelect: (result: JusoAddressResult) => void) {
  if (typeof window === "undefined") return;

  const returnUrl = `${API_BASE_URL}/address/juso-callback`;
  const expectedOrigin = new URL(API_BASE_URL).origin;
  const popupUrl =
    `${JUSO_POPUP_URL}?confmKey=${encodeURIComponent(JUSO_CONFM_KEY)}` +
    `&returnUrl=${encodeURIComponent(returnUrl)}&resultType=4`;

  const popup = window.open(popupUrl, "juso-popup", "width=570,height=420,scrollbars=yes,resizable=yes");

  function cleanup() {
    window.removeEventListener("message", handleMessage);
    window.clearInterval(closeCheck);
  }

  // event.source를 이 호출이 연 popup으로 한정한다 — 안 그러면 사용자가 선택 없이 팝업을
  // 닫고 다른 주소칸에서 다시 검색을 여는 식으로 리스너가 여러 개 쌓였을 때, 메시지 하나가
  // 와도 지워지지 않은 예전 리스너까지 같이 반응해서 엉뚱한 필드에 값이 들어갈 수 있다.
  function handleMessage(event: MessageEvent) {
    if (event.origin !== expectedOrigin || event.source !== popup) return;
    const data = event.data as Partial<JusoAddressResult & { source: string }> | null;
    if (!data || data.source !== "juso-address-callback") return;
    cleanup();
    onSelect({
      roadAddr: data.roadAddr ?? "",
      addrDetail: data.addrDetail ?? "",
      extraAddr: data.extraAddr ?? "",
      jibunAddr: data.jibunAddr ?? "",
      zipNo: data.zipNo ?? "",
    });
  }

  window.addEventListener("message", handleMessage);
  // 주소를 고르지 않고 팝업을 닫으면 메시지가 영영 안 와서 위 리스너가 못 지워진다 —
  // 닫힘 여부를 폴링해서 그 경우에도 정리한다.
  const closeCheck = window.setInterval(() => {
    if (popup?.closed) cleanup();
  }, 500);
}

// addrDetail(동/호수)·extraAddr(참고항목)는 juso.go.kr이 필요하다고 판단할 때만(공동주택
// 등) 채워 보내는 선택 필드라 없는 경우가 흔하다 — 그대로 이어붙이면 끝에 빈 칸이 남는다.
// 순서는 "도로명주소 + 동/호수 + (참고항목)"이 실제 우편물 주소 표기 관례와 같다.
export function formatJusoAddress(result: JusoAddressResult): string {
  return [result.roadAddr, result.addrDetail, result.extraAddr].filter(Boolean).join(" ");
}
