**M4 NO-GO — P2 결함 3개, 독립 테스트 5개 실패.**

1. **P2 — `src/app/weekWiring.ts:28`**: 난이도 변경 후 재시작하면 Gaz가 이전 난이도의 최고 기록과 비교합니다.
2. **P2 — `src/sim/scores.ts:154,173`**: 잘못된 등급이나 다른 난이도 기록이 저장 데이터 검증을 통과해 정상 최고 기록을 막습니다.
3. **P2 — `src/core/save/scores.ts:27`**: 성공적으로 읽은 기록도 이후 저장소 읽기 오류가 발생하면 메모리에서 사라집니다.

| 승인 항목 | 판정 |
|---|---|
| T4.1 순위·파싱 | FAIL |
| T4.2 저장·메모리 대체 | FAIL |
| T4.3 보고서 전 기록 | PASS |
| T4.4 Scores 화면 | UNVERIFIED — 마크업 검사 통과 |
| T4.5 Gaz 신기록 대사 | FAIL |
| T4.6 개발용 음성 | PASS |
| T4.7 브라우저 E2E | UNVERIFIED |
| Done when | UNVERIFIED |

기준 검사 **890/890 통과**. 최종 전체 검사 **894 통과 / 5 실패, exit 1**이며 기존 M3 테스트 **9/9 통과**입니다. 결정성 검색 0건, rushTrace 7개 일치, 밸런스 CSV 동일. 브라우저 독립 실행은 `EPERM`으로 차단됐으며 하네스 결과는 별도로 기록했습니다.

[전체 보고서·16개 커밋별 평가](/Users/edwardhwang/Desktop/no-wukkas-cafe/docs/reviews/2026-10-19-main-eba0ec7.md) · [독립 회귀 테스트](/Users/edwardhwang/Desktop/no-wukkas-cafe/tests/review/independentM4.test.ts)

**Questions for Edward:** 추가 결정은 필요 없습니다.

브랜치: `chore/review-main-eba0ec7`  
**리뷰 커밋 SHA: 하네스 생성 대기.** 지시대로 `.git`을 수정하지 않고 파일을 남겼습니다. 검토 대상 SHA는 `eba0ec7156e16da0095b39272e9ed540b9d74dc3`이며, **red count는 5**입니다.

