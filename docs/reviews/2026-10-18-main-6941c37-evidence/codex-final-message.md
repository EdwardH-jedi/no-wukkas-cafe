**판정: FIX — 결함 3건, red 테스트 4개.** [전체 보고서와 35개 커밋별 검토](/Users/edwardhwang/Desktop/nwc-review-2/docs/reviews/2026-10-18-main-6941c37.md)

1. **P2** — [audioPanel.ts:262](/Users/edwardhwang/Desktop/nwc-review-2/src/ui/audioPanel.ts:262): 키 변경 대기 중 창을 닫으면 다음 게임 키가 바인딩으로 저장되고 입력이 차단됩니다.
2. **P2** — [voiceLines.ts:334](/Users/edwardhwang/Desktop/nwc-review-2/src/audio/voiceLines.ts:334): AudioContext가 정지된 상태에서도 디코딩 완료 즉시 자막 시작 콜백이 실행됩니다.
3. **P3** — [audioPanel.ts:216](/Users/edwardhwang/Desktop/nwc-review-2/src/ui/audioPanel.ts:216): “Usual keys”가 키를 초기화하지 않고 창만 닫습니다.

| M1 수용 항목 | 판정 |
|---|---|
| 새 리뷰의 main 반영 | UNVERIFIED — 병합하지 않음 |
| 모든 FAIL에 red 재현 테스트 | PASS — 4개 |
| Q1 테스트 재발행 | PASS — 기존 28eb1b4 유지·검증 |
| Q1–Q5 HUMAN gate | UNVERIFIED — Q2–Q5 미결 |

타입 검사·린트 통과. 기본 **797/797 통과**, 최종 **798 통과·4 실패**입니다. 결정성 검색은 0건, rushTrace는 7/7 일치했습니다. 오디오 게이트는 미승인 자산을 거부했고 E2E는 실행하지 않았습니다.

**Questions for Edward** — 기존 Q2/Q3 정리를 승인할지, Q4 extra-hot 게이지 목표를 변경할지, Q5 자막 규칙을 Day 1/practice에도 적용할지 결정이 남았습니다.

**새 커밋은 없습니다.** 샌드박스가 Git `index.lock` 생성을 거부해 exit 128로 중단됐습니다. 테스트·보고서는 `chore/review-main-6941c37`에 미커밋 상태로 보존했습니다. 현재 HEAD는 `28eb1b4a418473c6d35dd7ac4802eba357262f23`이며 새 결과물은 포함하지 않습니다. **Red count: 4.**