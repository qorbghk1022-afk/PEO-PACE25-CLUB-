/**
 * 분기(Quarter) 공통 상수.
 *
 * 새 분기 시작 시 배열 맨 앞에 1건 추가하면 ChallengeBoard / SeasonDraw가
 * 자동으로 반영. UI에서 최신 분기가 기본 선택됨 (idx 0).
 *
 * manualSessions — 해당 세션일에 activities가 없어도 자동 참여 인정할 닉네임 목록.
 *   규칙 정정 이후에도 과거 실제 참여 이력을 보존하기 위해 사용.
 */

export interface QuarterConfig {
  name: string
  start: string                      // YYYY-MM-DD
  end: string                        // YYYY-MM-DD
  challengeDates: Array<{ start: string; end: string }>   // 2주 챌린지 6개
  sessionDates: string[]             // 정기세션 3개 (매월 2째 토)
  manualSessions?: Record<string, string[]>  // { 'YYYY-MM-DD': [닉네임...] }
  manualSessionsCrewId?: string       // 이 crew_id에만 manualSessions 적용 (다른 크루엔 미적용)
}

export const QUARTERS: QuarterConfig[] = [
  // 최신 분기를 맨 앞에. 새 분기 추가 시 여기에 push.
  {
    name: 'Q2-2026',
    start: '2026-04-20',
    end: '2026-07-12',
    challengeDates: [
      { start: '2026-04-20', end: '2026-05-03' },
      { start: '2026-05-04', end: '2026-05-17' },
      { start: '2026-05-18', end: '2026-05-31' },
      { start: '2026-06-01', end: '2026-06-14' },
      { start: '2026-06-15', end: '2026-06-28' },
      { start: '2026-06-29', end: '2026-07-12' },
    ],
    sessionDates: ['2026-05-09', '2026-06-13', '2026-07-11'],  // 매월 2째 토
  },
  {
    name: 'Q1-2026',
    start: '2026-01-26',
    end: '2026-04-19',
    challengeDates: [
      { start: '2026-01-26', end: '2026-02-08' },
      { start: '2026-02-09', end: '2026-02-22' },
      { start: '2026-02-23', end: '2026-03-08' },
      { start: '2026-03-09', end: '2026-03-22' },
      { start: '2026-03-23', end: '2026-04-05' },
      { start: '2026-04-06', end: '2026-04-19' },
    ],
    sessionDates: ['2026-02-14', '2026-03-14', '2026-04-11'],  // 매월 2째 토
    manualSessions: {
      '2026-02-14': ['멀루', '네모러너', '머룬', 'JM', '백화'],
      // 3월 (03-14): 참여자 없음
      '2026-04-11': ['머룬'],
    },
    manualSessionsCrewId: '2891fdd5-545b-4144-81f6-229df8dd5457', // HRC 전용 (PEO는 Q1 미존재)
  },
]

/** "월" 표기 (예: 2026-02-14 → "2월 14일") */
export function formatSessionLabel(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number)
  return `${m}월 ${d}일`
}

/** 현재 시각 기준 해당 분기 상태 판정 */
export function quarterStatus(q: QuarterConfig, now: Date = new Date()): 'upcoming' | 'active' | 'ended' {
  const today = now.toISOString().slice(0, 10)
  if (today < q.start) return 'upcoming'
  if (today > q.end) return 'ended'
  return 'active'
}
