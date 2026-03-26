/**
 * PEO 점수 체계 v4.0
 * Q = 스피드x0.3 + 지구력x0.25 + 롱런x0.15 + 꾸준함x0.2 + 효율성x0.1
 */

/** 스피드 점수 — 페이스 3:30=100점, 11:00=0점 */
export function calcSpeedScore(avgPaceSecPerKm: number): number {
  if (!avgPaceSecPerKm || avgPaceSecPerKm <= 0) return 0
  const paceMin = avgPaceSecPerKm / 60
  return Math.min(Math.max(((11 - paceMin) / 7.5) * 100, 0), 100)
}

/** 지구력 점수 — 0~15km:0→75점, 15~30km:75→90점, 30~50km:90→100점 */
export function calcEnduranceScore(totalDistKm: number): number {
  if (totalDistKm <= 0) return 0
  if (totalDistKm <= 15) return (totalDistKm / 15) * 75
  if (totalDistKm <= 30) return 75 + ((totalDistKm - 15) / 15) * 15
  if (totalDistKm <= 50) return 90 + ((totalDistKm - 30) / 20) * 10
  return 100
}

/** 롱런 점수 — 0km=0, 15km=70, 21km=80, 42.195km=100 */
export function calcLongRunScore(longestKm: number): number {
  if (longestKm <= 0) return 0
  if (longestKm >= 42.195) return 100
  if (longestKm >= 21) return 80 + ((longestKm - 21) / (42.195 - 21)) * 20
  if (longestKm >= 15) return 70 + ((longestKm - 15) / 6) * 10
  return (longestKm / 15) * 70
}

/** 꾸준함 점수 — 2주 5일 이상 = 100점 */
export function calcConsistencyScore(daysRun: number): number {
  return Math.min((daysRun / 5) * 100, 100)
}

/** 효율성 점수 — moving/elapsed: 80%=0점, 100%=100점 */
export function calcEfficiencyScore(efficiency: number): number {
  return Math.min(Math.max(((efficiency - 0.8) / 0.2) * 100, 0), 100)
}

/** 최종 점수 */
export function calcTotalScore(s: {
  speed: number; endurance: number; longRun: number
  consistency: number; efficiency: number
}): number {
  return s.speed * 0.3 + s.endurance * 0.25 + s.longRun * 0.15 + s.consistency * 0.2 + s.efficiency * 0.1
}

/** LV 계산: ROUNDDOWN(100 x (EXP/b)^p)
 *  b=54000: 5개 능력치 체계 기준 난이도 파라미터 (스펙 v2.0)
 *  p=0.72:  레벨 상승 곡선 감속 지수
 *  목표: LV10≈2개월 / LV30≈12개월 / LV50≈24개월 / LV100=이론상 불가
 */
export function calcLv(totalExp: number, b = 54000, p = 0.72): number {
  if (totalExp <= 0) return 1
  return Math.max(1, Math.floor(100 * Math.pow(totalExp / b, p)))
}

/** 페이스 포맷: 초/km → 'M:SS' */
export function formatPace(secPerKm: number): string {
  if (!secPerKm || secPerKm <= 0) return '--:--'
  const min = Math.floor(secPerKm / 60)
  const sec = Math.round(secPerKm % 60)
  return `${min}:${sec.toString().padStart(2, '0')}`
}

/** 거리 포맷 */
export function formatDist(km: number): string {
  return km.toFixed(2) + 'km'
}

/** 시간 포맷: 초 → 'H:MM:SS' */
export function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/** 페이스 문자열 'M:SS' → 초 */
export function parsePaceStr(paceStr: string): number {
  if (!paceStr) return 0
  const parts = paceStr.split(':')
  return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0)
}

/** 시간 문자열 '(H:)MM:SS' → 초 */
export function parseTimeStr(timeStr: string): number {
  if (!timeStr) return 0
  const parts = timeStr.replace(/^0+:/, '').trim().split(':')
  if (parts.length === 3) {
    return (parseInt(parts[0]) || 0) * 3600 + (parseInt(parts[1]) || 0) * 60 + (parseInt(parts[2]) || 0)
  }
  return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0)
}
