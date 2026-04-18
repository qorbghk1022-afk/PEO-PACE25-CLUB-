# PEO Running Crew Web App

러닝 크루 PEO의 회원 능력치/챌린지/랭킹/캘린더 웹앱

## 배포 URL
- **Production**: https://pace25.netlify.app
- **GitHub**: https://github.com/qorbghk1022-afk/peo-running-crew
- **자동 배포**: GitHub main 브랜치 push → Netlify 자동 빌드

## 기술 스택
- **프론트엔드**: Vanilla HTML + CSS + JavaScript (프레임워크 없음)
- **차트**: Chart.js 4.4.7 (CDN)
- **폰트**: Noto Sans KR (Google Fonts CDN)
- **호스팅**: Netlify (정적 사이트)
- **데이터**: 모든 데이터 JS 파일에 하드코딩 (백엔드 없음)

## 파일 구조

```
peo-app-v2/
├── index.html          # 메인 HTML (4개 탭 구조)
├── style.css           # 전체 스타일 (~1500줄)
├── app.js              # 앱 로직 (~820줄)
├── data.js             # 회원/챌린지/3개월점수 데이터 (~260줄)
├── peo_raw_data.json   # 원시 러닝 기록 (불꽃캘린더용, ~600건)
├── egg_star.png        # 별 무늬 알 캐릭터 원본
├── egg_star_clean.png  # 배경 제거된 알 캐릭터 (사용 중)
├── peo-logo.jpg        # PEO 로고
└── README.md           # 이 파일
```

## 앱 구조

### 4개 탭
1. **마이페이지** (`tab-mypage`)
   - 크루원 선택 드롭다운
   - 캐릭터 카드 UI (LV, 닉네임, 알 이미지+배번표, 레이더차트, 누적거리/일수)
   - 시즌 스탯 (현재/이전 시즌 전환 가능)
   - 3개월 종합 점수 바차트
   - 시즌 거리 비교

2. **챌린지보드** (`tab-challenge`)
   - 팀 보기 / 개인 보기 토글
   - 13개 팀 카드 (팀 합산 벌금 시스템)
   - 벌금 = MAX(팀목표 - 팀합산km, 0) × ₩3,000 / 활성멤버수

3. **랭킹** (`tab-ranking`)
   - 이전 시즌 최종점수 기준 26명 순위
   - 카드 클릭 → 마이페이지 이동 (goToMember)
   - 1~3위 메달 표시

4. **불꽃캘린더** (`tab-calendar`)
   - 회원별 월간 캘린더 (뛴 날 🔥 표시)
   - 현재 연속 스트릭
   - 날짜 클릭 → 상세 기록 팝업 (거리/페이스/시간/케이던스)
   - peo_raw_data.json에서 데이터 fetch

## 데이터 구조

### data.js

```javascript
const PEO_DATA = {
  season: {
    current: { start: "2026.3.23", end: "2026.4.5" },
    previous: { start: "2026.3.9", end: "2026.3.22" }
  },
  members: [
    {
      id: "백화",           // 고유 ID (닉네임)
      name: "백화",          // 표시 이름
      realname: "배규화",    // 실명
      lv: 9,                // 레벨
      totalExp: 2101,       // 총 누적 EXP
      expPct: 1,            // 현재 레벨 내 EXP %
      totalDist: 238.6,     // 누적 거리 (km)
      totalDays: 44,        // 누적 러닝 일수
      current: {            // 현재 2주 시즌 데이터
        distance, longest, pace, days, cadence,
        prevDistance, endurance, longRun,
        finalEndurance, speed, consistency,
        cadenceScore, totalScore
      },
      previous: { ... }     // 이전 2주 시즌 데이터 (동일 구조)
    },
    // ... 26명
  ],
  challenge: {
    season: "2026.3.23 ~ 2026.4.5",
    goal: 15,               // km 목표
    finePerKm: 3000,        // 벌금 단가 (원/km)
    totalParticipants: 26,
    teams: [
      {
        num: 1,
        members: [
          { id, rank, lv, km, remain, fine, msg, remark }
        ]
      },
      // ... 13개 팀
    ]
  }
};

const QUARTERLY_DATA = {
  period: { start: "2025.12.29", end: "2026.3.22" },
  scores: {
    "JM": { rank, total, endurance, speed, consistency, cadence, longrun },
    // ... 26명
  }
};
```

### peo_raw_data.json

```json
[
  ["날짜", "회원 ID", "거리(KM)", "케이던스", "시간", "평균페이스", "메모"],
  ["2026-03-15", "백화", "2.55", "147", "0:15:00", "05:53"],
  ...
]
```

## 점수 체계 (v4.0 — 5개 능력치)

| 능력치 | 가중치 | 공식 |
|--------|--------|------|
| 스피드 | 0.30 | MIN(MAX((11-페이스분)/7.5×100, 0), 100) |
| 지구력 | 0.25 | 0-15km→0-75, 15-30km→75-90, 30-50km→90-100 |
| 롱런 | 0.15 | 0km=0, 15km=70, 21km=80, 42.195km=100 |
| 꾸준함 | 0.20 | MIN(일수/5×100, 100) |
| 케이던스 | 0.10 | (케이던스-120)/60×100 |

**최종점수** = 스피드×0.3 + 지구력×0.25 + 롱런×0.15 + 꾸준함×0.2 + 케이던스×0.1

## LV 시스템

```
LV = ROUNDDOWN(100 × (EXP / 54000) ^ 0.72, 0)
```
- b=54000, p=0.72
- LV10 ≈ 2개월, LV30 ≈ 12개월, LV50 ≈ 24개월

## 디자인 규칙
- 배경: 흰색 (#FFFFFF)
- 텍스트: 검정 (#000000)
- 악센트: #D92610 (모든 게이지/강조/차트)
- 폰트: Noto Sans KR
- 모바일 퍼스트 (390px 기준)
- 다크모드 없음

## 캐릭터 시스템 (개발 중)
- 알 5종류: 별⭐, 구름☁️, 달🌙, 하트❤️, 해☀️
- LV에 따라 성장: 알 → 알+다리 → 알+다리+팔 → 부화 → 슬라임 → 픽셀 러너 → 최종
- 배번표: 알/캐릭터 가슴에 닉네임 오버레이 (CSS absolute positioning)
- 알 무늬별 배경색: 별=노랑, 구름=하늘, 달=보라, 하트=분홍, 해=주황

## 스프레드시트 연동

데이터 소스는 Google Sheets (1기: `1gdEsbzlsIoqo0lEsM3b23VJqsNZwZRW48Z3GATpgaIM`).
현재는 수동으로 data.js를 업데이트 → GitHub push → Netlify 자동 배포.

### 데이터 업데이트 방법
1. 스프레드시트에서 최신 데이터 수집
2. data.js + peo_raw_data.json 재생성
3. `git push origin main` → Netlify 자동 배포
4. pace25.netlify.app에 1~2분 후 반영

## 주요 함수 (app.js)

| 함수 | 역할 |
|------|------|
| `init()` | 초기화, 이벤트 바인딩 |
| `selectMember(id)` | 회원 선택 → 모든 섹션 업데이트 |
| `goToMember(id)` | 다른 탭에서 마이페이지로 이동 (window 전역) |
| `updateLVCard(m)` | 캐릭터 카드 업데이트 |
| `updateRadarChart(m)` | 레이더 차트 (3개월 종합 점수) |
| `updateStats(m)` | 시즌 스탯 (현재/이전 전환 가능) |
| `updateScores(m)` | 3개월 종합 점수 바차트 |
| `renderTeamView()` | 챌린지보드 팀 보기 |
| `renderIndividualView()` | 챌린지보드 개인 보기 |
| `initRanking()` | 랭킹 탭 렌더링 |
| `renderCalendar()` | 불꽃캘린더 렌더링 |
| `window._openCalDay(date)` | 캘린더 날짜 클릭 팝업 |
| `window.goToMember(id)` | 전역 회원 이동 함수 |

## 알려진 이슈
- 배번표 글자 위치는 알 이미지 종류마다 CSS 미세 조정 필요
- 시즌 스탯 네비게이션은 현재 2시즌(현재+이전)만 지원
- 불꽃캘린더의 peo_raw_data.json은 1기 원시데이터 기준
- Strava 실시간 연동 미구현 (현재 정적 데이터)

## 향후 개발 방향
1. 캐릭터 이미지 5종류 × 성장 단계 적용
2. Strava 개별 OAuth → 실시간 데이터
3. 백엔드 서버 (Express/FastAPI) + DB
4. 사용자 인증 시스템
5. 네이티브 앱 전환 (React Native / Flutter)
