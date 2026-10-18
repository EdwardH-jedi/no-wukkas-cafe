**판정: FIX — P2 1건, red 6개.** [전체 보고서](/Users/edwardhwang/Desktop/nwc-review-2/docs/reviews/2026-10-18-main-0cae2cf.md)에 커밋 8개와 모든 수용 항목의 검증 결과를 기록했습니다.

1. **P2 — [voiceLines.ts:95](/Users/edwardhwang/Desktop/nwc-review-2/src/audio/voiceLines.ts:95):** 정지 중 취소한 음원이 재개 후 60ms 동안 출력 경로에 남으며, 타이틀 복귀·고객 퇴장·대사 교체에서 재현됩니다.

| M1 수용 항목 | 판정 |
|---|---|
| 이번 리뷰가 main에 반영됨 | UNVERIFIED — 하네스 대기 |
| 모든 FAIL에 red 재현 테스트 | PASS — 결함 1건, 테스트 6개 |
| Q1 reviewer 테스트 재발행 | PASS |
| Q1–Q5 HUMAN 결정 완료 | UNVERIFIED — Q2–Q5 미결 |

typecheck·lint **exit 0**, 최종 테스트 **807 통과 / 6 실패, exit 1**입니다. 이전 F1–F3는 green이며, 결정성 검색 **0건**, rushTrace **7/7 동일**, 오디오 게이트 fixture **13/13 통과**입니다.

**Questions for Edward**

- **Q7:** 브라우저가 오디오만 정지시키면 자막을 계속 기다릴지, 즉시 표시할지, 게임도 일시정지할지?
- 기존 **Q2/Q3** 정리 승인, **Q4** extra-hot 게이지, **Q5** Day 1/practice 자막 정책은 미결입니다.

**리뷰 커밋 SHA는 아직 없습니다.** 지시대로 add/commit하지 않았습니다. `chore/review-main-0cae2cf`에 파일을 남겼으며, 현재 기준 HEAD는 `0cae2cfbe5b0c8a5e0bf9721eb48069810c8e208`입니다. 이 SHA에는 이번 변경이 포함되지 않았습니다.

