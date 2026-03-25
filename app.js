// PEO Running Crew - App Logic
(function() {
  'use strict';

  let radarChart = null;
  let currentMember = null;
  let rawData = null; // Will hold parsed raw running data
  let calYear = 2026;
  let calMonth = 2; // 0-indexed: 2 = March
  let calMemberId = null;
  let seasonIndex = 0; // 0 = current, 1 = previous, 2+ = older seasons

  // ===== INITIALIZATION =====
  function init() {
    populateMemberSelect();
    setupTabNavigation();
    
    // Select first member
    const select = document.getElementById('member-select');
    if (select.options.length > 0) {
      select.value = PEO_DATA.members[0].id;
      selectMember(PEO_DATA.members[0].id);
    }

    select.addEventListener('change', (e) => {
      selectMember(e.target.value);
    });

    // Season navigation
    document.getElementById('season-prev').addEventListener('click', () => {
      if (currentMember) {
        const maxSeasons = Math.floor((PEO_DATA.members[0] ? getSeasonCount() : 1)) - 1;
        if (seasonIndex < maxSeasons) {
          seasonIndex++;
          updateStats(currentMember);
        }
      }
    });
    document.getElementById('season-next').addEventListener('click', () => {
      if (currentMember && seasonIndex > 0) {
        seasonIndex--;
        updateStats(currentMember);
      }
    });

    // Initialize Challenge Board
    initChallengeBoard();
    
    // Initialize Ranking
    initRanking();
    
    // Load raw data then initialize calendar
    loadRawData().then(() => {
      initCalendar();
    });
  }

  // ===== MEMBER SELECT =====
  function populateMemberSelect() {
    const select = document.getElementById('member-select');
    // Sort members by LV desc, then totalScore desc
    const sorted = [...PEO_DATA.members].sort((a, b) => {
      if (b.lv !== a.lv) return b.lv - a.lv;
      return (b.previous.totalScore || 0) - (a.previous.totalScore || 0);
    });
    
    sorted.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `LV${m.lv}  ${m.name} (${m.realname})`;
      select.appendChild(opt);
    });
  }

  // ===== SELECT MEMBER =====
  function selectMember(memberId) {
    const member = PEO_DATA.members.find(m => m.id === memberId);
    if (!member) return;
    currentMember = member;
    seasonIndex = 0; // Reset to current season

    updateLVCard(member);
    updateRadarChart(member);
    updateStats(member);
    updateScores(member);
    updateComparison(member);
  }

  // Navigate to member from other tabs
  function goToMember(memberId) {
    const select = document.getElementById('member-select');
    select.value = memberId;
    selectMember(memberId);
    // Switch to 마이페이지 tab
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-mypage').classList.add('active');
    document.querySelector('[data-tab="mypage"]').classList.add('active');
    window.scrollTo(0, 0);
  }

  // Get total number of seasons available in data
  function getSeasonCount() {
    // Count how many 26-row blocks exist in 회원2주능력치
    // We have current + previous in data.js = 2 seasons
    return 2;
  }

  // ===== LV CARD (Character Card) =====
  function updateLVCard(m) {
    // Top bar
    document.querySelector('[data-testid="text-lv"] .lv-number').textContent = `LV ${m.lv}`;
    document.querySelector('[data-testid="text-member-name"]').textContent = m.name;
    
    // LV gauge (linear bar + %)
    const gaugeFill = document.getElementById('lv-gauge-fill');
    const gaugePct = document.getElementById('lv-gauge-pct');
    if (gaugeFill) gaugeFill.style.width = `${m.expPct}%`;
    if (gaugePct) gaugePct.textContent = `${m.expPct}%`;

    // Bib name overlay on egg
    const bibName = document.querySelector('[data-testid="text-bib-name"]');
    if (bibName) bibName.textContent = m.name;

    // Hidden backward compat elements
    const realnameEl = document.querySelector('[data-testid="text-realname"]');
    if (realnameEl) realnameEl.textContent = m.realname;
    const expEl = document.querySelector('[data-testid="text-exp"]');
    if (expEl) expEl.textContent = `${m.totalExp.toLocaleString()} EXP`;
    const expBar = document.getElementById('exp-bar');
    if (expBar) expBar.style.width = `${m.expPct}%`;
    const expPctEl = document.querySelector('[data-testid="text-exp-percent"]');
    if (expPctEl) expPctEl.textContent = `${m.expPct}%`;
    const distEl = document.querySelector('[data-testid="text-total-dist"]');
    if (distEl) distEl.textContent = `${m.totalDist.toFixed(1)} km`;
    const daysEl = document.querySelector('[data-testid="text-total-days"]');
    if (daysEl) daysEl.textContent = `${m.totalDays}일`;

    // Right panel stats
    const cardDist = document.querySelector('[data-testid="text-card-dist"]');
    const cardDays = document.querySelector('[data-testid="text-card-days"]');
    const cardExp = document.querySelector('[data-testid="text-card-exp"]');
    if (cardDist) cardDist.textContent = `${m.totalDist.toFixed(1)}km`;
    if (cardDays) cardDays.textContent = `${m.totalDays}일`;
    if (cardExp) cardExp.textContent = m.totalExp.toLocaleString();

    // Role/title
    const q = QUARTERLY_DATA.scores[m.id];
    const totalEl = document.querySelector('[data-testid="text-char-total"]');
    const roleEl = document.querySelector('[data-testid="text-char-role"]');
    const titleEl = document.querySelector('[data-testid="text-char-title"]');

    if (q) {
      if (totalEl) totalEl.textContent = q.total;
      const topStat = getTopStat(q);
      if (roleEl) roleEl.textContent = getRoleTitle(topStat, q);
      if (titleEl) titleEl.textContent = getRoleSubtitle(topStat);
    } else {
      if (totalEl) totalEl.textContent = '0';
      if (roleEl) roleEl.textContent = 'PEO의 크루원';
      if (titleEl) titleEl.textContent = '';
    }
  }

  function getTopStat(q) {
    const stats = [
      { key: 'speed', val: q.speed },
      { key: 'endurance', val: q.endurance },
      { key: 'consistency', val: q.consistency },
      { key: 'cadence', val: q.cadence },
      { key: 'longrun', val: q.longrun }
    ];
    stats.sort((a, b) => b.val - a.val);
    return stats[0].key;
  }

  function getRoleTitle(topStat, q) {
    if (q.total >= 85) return 'PEO의 에이스';
    if (q.total >= 75) return 'PEO의 핵심 러너';
    const titles = {
      speed: 'PEO의 스피드스터',
      endurance: 'PEO의 마라토너',
      consistency: 'PEO의 꾸준러',
      cadence: 'PEO의 비트러너',
      longrun: 'PEO의 롱런왕'
    };
    return titles[topStat] || 'PEO의 크루원';
  }

  function getRoleSubtitle(topStat) {
    const subs = {
      speed: '빠른 발걸음의 소유자',
      endurance: '끝까지 달리는 자',
      consistency: '매일이 러닝데이',
      cadence: '리듬감의 달인',
      longrun: '긴 거리의 정복자'
    };
    return subs[topStat] || '';
  }

  // ===== RADAR CHART =====
  function updateRadarChart(m) {
    const ctx = document.getElementById('radar-chart').getContext('2d');
    
    // Use 3-month comprehensive scores
    const q = QUARTERLY_DATA.scores[m.id] || { speed: 0, endurance: 0, consistency: 0, cadence: 0, longrun: 0 };
    const label = '3개월 종합';
    
    const values = [
      q.speed,
      q.endurance,
      q.consistency,
      q.cadence,
      q.longrun
    ];

    const seasonLabel = document.querySelector('[data-testid="text-season-label"]');
    seasonLabel.textContent = `3개월 종합 (${QUARTERLY_DATA.period.start} ~ ${QUARTERLY_DATA.period.end})`;

    // Update labels with scores
    const labelNames = ['스피드', '지구력', '꾸준함', '케이던스', '롱런'];
    const labelsWithScores = labelNames.map((name, i) => name + '\n' + values[i]);

    if (radarChart) {
      radarChart.data.labels = labelsWithScores;
      radarChart.data.datasets[0].data = values;
      radarChart.data.datasets[0].label = label;
      radarChart.update('none');
      return;
    }

    radarChart = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: labelsWithScores,
        datasets: [{
          label: label,
          data: values,
          backgroundColor: 'rgba(217, 38, 16, 0.18)',
          borderColor: '#D92610',
          borderWidth: 2,
          pointBackgroundColor: '#D92610',
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 1.5,
          pointRadius: 3,
          pointHoverRadius: 5,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#000',
            titleColor: '#fff',
            bodyColor: '#fff',
            titleFont: { family: "'Noto Sans KR', sans-serif", size: 10, weight: '600' },
            bodyFont: { family: "'Noto Sans KR', sans-serif", size: 10 },
            padding: 6,
            cornerRadius: 6,
            callbacks: {
              label: function(ctx) {
                return `${ctx.label}: ${ctx.raw}점`;
              }
            }
          }
        },
        scales: {
          r: {
            beginAtZero: true,
            min: 0,
            max: 100,
            ticks: {
              stepSize: 25,
              font: { size: 7, family: "'Noto Sans KR', sans-serif" },
              color: '#CCC',
              backdropColor: 'transparent',
              display: false
            },
            grid: {
              color: '#E0E0E0',
              lineWidth: 0.8
            },
            angleLines: {
              color: '#E0E0E0',
              lineWidth: 0.8
            },
            pointLabels: {
              font: { size: 9, weight: '500', family: "'Noto Sans KR', sans-serif" },
              color: '#555'
            }
          }
        }
      }
    });
  }

  // ===== SEASON STATS WITH NAVIGATION =====
  function updateStats(m) {
    const seasons = [
      { label: '현재 시즌', period: PEO_DATA.season.current, data: m.current },
      { label: '이전 시즌', period: PEO_DATA.season.previous, data: m.previous }
    ];
    
    const idx = Math.min(seasonIndex, seasons.length - 1);
    const season = seasons[idx];
    
    // Update title and period
    document.getElementById('season-title').textContent = season.label + ' 스탯';
    document.querySelector('[data-testid="text-current-period"]').textContent = 
      `${season.period.start} ~ ${season.period.end}`;
    
    // Update nav button states
    document.getElementById('season-prev').style.visibility = idx < seasons.length - 1 ? 'visible' : 'hidden';
    document.getElementById('season-next').style.visibility = idx > 0 ? 'visible' : 'hidden';

    const c = season.data;
    document.querySelector('[data-testid="text-stat-distance"]').textContent = c.distance.toFixed(1);
    document.querySelector('[data-testid="text-stat-longest"]').textContent = c.longest.toFixed(1);
    document.querySelector('[data-testid="text-stat-pace"]').textContent = c.pace === "00:00" ? "-" : c.pace;
    document.querySelector('[data-testid="text-stat-days"]').textContent = c.days;
    document.querySelector('[data-testid="text-stat-cadence"]').textContent = c.cadence || '-';
  }

  // ===== SCORE BREAKDOWN (3-month comprehensive) =====
  function updateScores(m) {
    const q = QUARTERLY_DATA.scores[m.id] || { speed: 0, endurance: 0, consistency: 0, cadence: 0, longrun: 0, total: 0 };

    setScoreBar('total-score', q.total);
    setScoreBar('speed-score', q.speed);
    setScoreBar('endurance-score', q.endurance);
    setScoreBar('longrun-score', q.longrun);
    setScoreBar('consistency-score', q.consistency);
    setScoreBar('cadence-score', q.cadence);
  }

  function setScoreBar(id, value) {
    const bar = document.querySelector(`[data-testid="bar-${id}"]`);
    const num = document.querySelector(`[data-testid="text-${id}"]`);
    if (bar) bar.style.width = `${value}%`;
    if (num) num.textContent = value;
  }

  // ===== SEASON COMPARISON =====
  function updateComparison(m) {
    const currentDist = m.current.distance;
    const prevDist = m.previous.distance;
    const maxDist = Math.max(currentDist, prevDist, 1);

    const currentBar = document.getElementById('comp-current');
    const prevBar = document.getElementById('comp-previous');
    
    currentBar.style.width = `${(currentDist / maxDist) * 100}%`;
    prevBar.style.width = `${(prevDist / maxDist) * 100}%`;
    
    document.querySelector('[data-testid="text-current-dist"]').textContent = `${currentDist.toFixed(1)} km`;
    document.querySelector('[data-testid="text-prev-dist"]').textContent = `${prevDist.toFixed(1)} km`;

    const delta = currentDist - prevDist;
    const deltaEl = document.querySelector('[data-testid="text-delta"]');
    
    if (delta > 0) {
      deltaEl.textContent = `▲ ${delta.toFixed(1)} km 증가`;
      deltaEl.className = 'comp-delta positive';
    } else if (delta < 0) {
      deltaEl.textContent = `▼ ${Math.abs(delta).toFixed(1)} km 감소`;
      deltaEl.className = 'comp-delta negative';
    } else {
      deltaEl.textContent = '변동 없음';
      deltaEl.className = 'comp-delta neutral';
    }
  }

  // ===== TAB NAVIGATION =====
  function setupTabNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        
        // Update active states
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        contents.forEach(c => c.classList.remove('active'));
        document.getElementById(`tab-${target}`).classList.add('active');

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  // =======================================
  // TAB 2: CHALLENGE BOARD
  // =======================================
  function initChallengeBoard() {
    renderTeamView();
    renderIndividualView();
    setupViewToggle();
  }

  function setupViewToggle() {
    const btns = document.querySelectorAll('.view-toggle-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        btns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const views = document.querySelectorAll('.challenge-view');
        views.forEach(v => v.classList.remove('active'));
        
        if (btn.dataset.view === 'team') {
          document.getElementById('challenge-team-view').classList.add('active');
        } else {
          document.getElementById('challenge-individual-view').classList.add('active');
        }
      });
    });
  }

  function renderTeamView() {
    const container = document.getElementById('challenge-team-view');
    const goal = PEO_DATA.challenge.goal;
    const finePerKm = PEO_DATA.challenge.finePerKm;
    let html = '';

    PEO_DATA.challenge.teams.forEach(team => {
      // Active members (not on leave)
      const activeMembers = team.members.filter(m => m.remark === '');
      const teamKm = activeMembers.reduce((sum, m) => sum + m.km, 0);
      const teamGoal = activeMembers.length * goal; // 팀 합산 목표
      const teamRemain = Math.max(teamGoal - teamKm, 0);
      const teamFine = teamRemain * finePerKm;
      
      html += `<div class="team-card" data-testid="team-card-${team.num}">`;
      html += `<div class="team-card-header">`;
      html += `<span class="team-number">TEAM ${team.num}</span>`;
      html += `<span class="team-total-km">${teamKm}km</span>`;
      html += `</div>`;
      
      // Team fine summary
      if (teamFine > 0) {
        html += `<div class="team-fine-row">팀 벌금: ₩${teamFine.toLocaleString()} (남은 ${teamRemain}km / 목표 ${teamGoal}km)</div>`;
      } else {
        html += `<div class="team-fine-row team-clear">팀 벌금: ₩0 ✔ 완주!</div>`;
      }
      
      team.members.forEach(m => {
        const pct = Math.min((m.km / goal) * 100, 100);
        const isOnLeave = m.remark !== '';
        const nameClass = isOnLeave ? 'tm-name on-leave' : 'tm-name';
        
        html += `<div class="team-member-row">`;
        html += `<span class="${nameClass}">${m.id}</span>`;
        html += `<span class="tm-lv">LV${m.lv}</span>`;
        
        if (isOnLeave) {
          html += `<span class="tm-remark-badge">${m.remark}</span>`;
        } else {
          html += `<div class="tm-progress-wrap">`;
          html += `<div class="tm-progress-track"><div class="tm-progress-fill" style="width:${pct}%"></div></div>`;
          html += `<span class="tm-km">${m.km}km</span>`;
          html += `</div>`;
        }
        html += `</div>`;
        
        // Show message
        if (!isOnLeave && m.msg) {
          html += `<div style="display:flex;gap:8px;padding:0 0 4px 78px;align-items:center;"><span class="tm-msg">"${m.msg}"</span></div>`;
        }
      });
      
      html += `</div>`;
    });

    container.innerHTML = html;
  }

  function renderIndividualView() {
    const container = document.getElementById('challenge-individual-view');
    const goal = PEO_DATA.challenge.goal;
    const finePerKm = PEO_DATA.challenge.finePerKm;
    
    // Build team fine map (team-based fine calculation)
    const teamFineMap = {};
    PEO_DATA.challenge.teams.forEach(team => {
      const activeMembers = team.members.filter(m => m.remark === '');
      const teamKm = activeMembers.reduce((sum, m) => sum + m.km, 0);
      const teamGoal = activeMembers.length * goal;
      const teamRemain = Math.max(teamGoal - teamKm, 0);
      const teamFine = teamRemain * finePerKm;
      team.members.forEach(m => {
        teamFineMap[m.id] = { teamNum: team.num, teamFine: teamFine, teamKm: teamKm, teamGoal: teamGoal };
      });
    });
    
    // Collect all members from teams, sort by km desc then rank asc
    let allMembers = [];
    PEO_DATA.challenge.teams.forEach(team => {
      team.members.forEach(m => {
        allMembers.push({ ...m, teamNum: team.num });
      });
    });
    allMembers.sort((a, b) => {
      if (b.km !== a.km) return b.km - a.km;
      return a.rank - b.rank;
    });

    let html = '';
    allMembers.forEach((m, idx) => {
      const rank = idx + 1;
      const pct = Math.min((m.km / goal) * 100, 100);
      const isOnLeave = m.remark !== '';
      const nameClass = isOnLeave ? 'ind-name on-leave' : 'ind-name';
      const rankClass = rank <= 3 ? 'ind-rank top3' : 'ind-rank';
      const tf = teamFineMap[m.id];

      html += `<div class="individual-item">`;
      html += `<span class="${rankClass}">${rank}</span>`;
      html += `<div class="ind-info">`;
      html += `<div class="ind-name-row">`;
      html += `<span class="${nameClass}">${m.id}</span>`;
      html += `<span class="tm-lv">LV${m.lv}</span>`;
      html += `<span class="ind-team-badge">팀${m.teamNum}</span>`;
      if (isOnLeave) html += `<span class="tm-remark-badge">${m.remark}</span>`;
      html += `</div>`;
      
      if (!isOnLeave) {
        html += `<div class="ind-progress-row">`;
        html += `<div class="ind-progress-track"><div class="ind-progress-fill" style="width:${pct}%"></div></div>`;
        html += `</div>`;
      }
      html += `</div>`; // ind-info
      
      html += `<span class="ind-km">${m.km}km</span>`;
      
      html += `</div>`;
    });

    container.innerHTML = html;
  }

  // =======================================
  // TAB 3: RANKING
  // =======================================
  function initRanking() {
    const container = document.getElementById('ranking-list');
    
    // Sort by previous season totalScore descending
    const ranked = [...PEO_DATA.members]
      .filter(m => m.previous.totalScore > 0)
      .sort((a, b) => b.previous.totalScore - a.previous.totalScore);
    
    // Also add members with 0 score at the bottom
    const zeroScore = PEO_DATA.members
      .filter(m => m.previous.totalScore === 0)
      .sort((a, b) => b.lv - a.lv);

    const allRanked = [...ranked, ...zeroScore];
    
    let html = '';
    allRanked.forEach((m, idx) => {
      const rank = idx + 1;
      const p = m.previous;
      let itemClass = 'rank-item';
      if (rank === 1) itemClass += ' top1';
      else if (rank === 2) itemClass += ' top2';
      else if (rank === 3) itemClass += ' top3';

      const medals = ['', '🥇', '🥈', '🥉'];
      const medal = medals[rank] || '';

      html += `<div class="${itemClass}" data-testid="rank-item-${rank}" onclick="goToMember('${m.id}')" style="cursor:pointer">`;
      
      if (medal) {
        html += `<span class="rank-medal">${medal}</span>`;
      } else {
        html += `<span class="rank-num">${rank}</span>`;
      }
      
      html += `<div class="rank-info">`;
      html += `<div class="rank-name-row">`;
      html += `<span class="rank-name" data-testid="link-rank-${m.id}">${m.name}</span>`;
      html += `<span class="rank-lv">LV${m.lv}</span>`;
      html += `</div>`;
      
      // Mini score indicators
      html += `<div class="rank-scores-row">`;
      const scores = [
        { label: '스피드', val: p.speed },
        { label: '지구력', val: p.finalEndurance },
        { label: '꾸준', val: p.consistency },
        { label: '케이던스', val: p.cadenceScore }
      ];
      scores.forEach(s => {
        html += `<div class="rank-score-mini">`;
        html += `<span>${s.label}</span>`;
        html += `<div class="rank-score-mini-bar"><div class="rank-score-mini-fill" style="width:${s.val}%"></div></div>`;
        html += `</div>`;
      });
      html += `</div>`;
      
      html += `</div>`; // rank-info
      html += `<span class="rank-total-score">${p.totalScore}</span>`;
      html += `</div>`;
    });

    container.innerHTML = html;
  }

  // =======================================
  // TAB 4: FIRE CALENDAR
  // =======================================
  async function loadRawData() {
    try {
      const resp = await fetch('peo_raw_data.json');
      const json = await resp.json();
      // Parse: first row is header, rest are data
      const headers = json[0];
      rawData = [];
      for (let i = 1; i < json.length; i++) {
        const row = json[i];
        if (!row || row.length < 5) continue;
        rawData.push({
          date: row[0],
          memberId: row[1],
          distance: parseFloat(row[2]) || 0,
          cadence: parseInt(row[3]) || 0,
          time: row[4] || '',
          pace: row[5] || '',
          memo: row[6] || ''
        });
      }
    } catch (e) {
      console.error('Failed to load raw data:', e);
      rawData = [];
    }
  }

  function initCalendar() {
    // Populate calendar member select
    const select = document.getElementById('calendar-member-select');
    const sorted = [...PEO_DATA.members].sort((a, b) => {
      if (b.lv !== a.lv) return b.lv - a.lv;
      return (b.previous.totalScore || 0) - (a.previous.totalScore || 0);
    });
    
    sorted.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `LV${m.lv}  ${m.name} (${m.realname})`;
      select.appendChild(opt);
    });

    calMemberId = sorted[0]?.id || PEO_DATA.members[0].id;
    select.value = calMemberId;

    select.addEventListener('change', (e) => {
      calMemberId = e.target.value;
      renderCalendar();
    });

    // Nav buttons
    document.getElementById('cal-prev').addEventListener('click', () => {
      calMonth--;
      if (calMonth < 0) { calMonth = 11; calYear--; }
      renderCalendar();
    });

    document.getElementById('cal-next').addEventListener('click', () => {
      calMonth++;
      if (calMonth > 11) { calMonth = 0; calYear++; }
      renderCalendar();
    });

    // Modal close
    document.getElementById('cal-modal-close').addEventListener('click', closeCalModal);
    document.querySelector('.cal-modal-backdrop').addEventListener('click', closeCalModal);

    renderCalendar();
  }

  function getMemberRuns(memberId) {
    if (!rawData) return [];
    return rawData.filter(r => r.memberId === memberId);
  }

  function renderCalendar() {
    const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
    document.getElementById('cal-month-label').textContent = `${calYear}년 ${monthNames[calMonth]}`;

    const firstDay = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Get runs for this member in this month
    const memberRuns = getMemberRuns(calMemberId);
    const monthStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
    const runsInMonth = memberRuns.filter(r => r.date.startsWith(monthStr));
    
    // Group runs by date
    const runsByDate = {};
    runsInMonth.forEach(r => {
      if (!runsByDate[r.date]) runsByDate[r.date] = [];
      runsByDate[r.date].push(r);
    });

    const container = document.getElementById('cal-days');
    let html = '';

    // Empty cells for days before first day
    for (let i = 0; i < firstDay; i++) {
      html += `<div class="cal-day empty"></div>`;
    }

    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const hasRun = runsByDate[dateStr] && runsByDate[dateStr].length > 0;
      const isToday = dateStr === todayStr;
      
      let cls = 'cal-day';
      if (hasRun) cls += ' has-run';
      if (isToday) cls += ' today';

      html += `<div class="${cls}" ${hasRun ? `onclick="window._openCalDay('${dateStr}')"` : ''}>`;
      html += `<span class="cal-day-num">${d}</span>`;
      if (hasRun) html += `<span class="cal-fire">🔥</span>`;
      html += `</div>`;
    }

    container.innerHTML = html;

    // Update monthly summary
    const uniqueDays = Object.keys(runsByDate).length;
    const totalDist = runsInMonth.reduce((sum, r) => sum + r.distance, 0);
    document.querySelector('[data-testid="text-cal-days"]').textContent = `${uniqueDays}일`;
    document.querySelector('[data-testid="text-cal-dist"]').textContent = `${totalDist.toFixed(1)}km`;

    // Calculate current streak
    const allRunDates = new Set(memberRuns.map(r => r.date));
    let streak = 0;
    const checkDate = new Date(today);
    // If today has no run, start from yesterday
    const todayDateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
    if (!allRunDates.has(todayDateStr)) {
      checkDate.setDate(checkDate.getDate() - 1);
    }
    while (true) {
      const ds = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
      if (allRunDates.has(ds)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
    document.getElementById('cal-streak').textContent = `${streak}일`;
  }

  // Global function for onclick
  // Expose goToMember globally for onclick
  window.goToMember = function(memberId) {
    const select = document.getElementById('member-select');
    select.value = memberId;
    selectMember(memberId);
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-mypage').classList.add('active');
    document.querySelector('[data-tab="mypage"]').classList.add('active');
    window.scrollTo(0, 0);
  };

  window._openCalDay = function(dateStr) {
    const memberRuns = getMemberRuns(calMemberId);
    const dayRuns = memberRuns.filter(r => r.date === dateStr);
    if (dayRuns.length === 0) return;

    const parts = dateStr.split('-');
    const title = `${parseInt(parts[1])}월 ${parseInt(parts[2])}일 러닝 기록`;
    document.getElementById('cal-modal-title').textContent = title;

    let html = '';
    dayRuns.forEach((run, idx) => {
      html += `<div class="run-detail-card">`;
      if (dayRuns.length > 1) {
        html += `<div class="run-detail-title">Run ${idx + 1}</div>`;
      }
      html += `<div class="run-detail-grid">`;
      html += `<div class="run-detail-item"><span class="run-detail-value">${run.distance.toFixed(2)}km</span><span class="run-detail-label">거리</span></div>`;
      html += `<div class="run-detail-item"><span class="run-detail-value">${run.pace || '-'}</span><span class="run-detail-label">페이스</span></div>`;
      html += `<div class="run-detail-item"><span class="run-detail-value">${run.time || '-'}</span><span class="run-detail-label">시간</span></div>`;
      html += `<div class="run-detail-item"><span class="run-detail-value">${run.cadence || '-'}</span><span class="run-detail-label">케이던스</span></div>`;
      html += `</div>`;
      if (run.memo) {
        html += `<div style="margin-top:8px;font-size:12px;color:#888;">📝 ${run.memo}</div>`;
      }
      html += `</div>`;
    });

    document.getElementById('cal-modal-body').innerHTML = html;
    document.getElementById('cal-modal').classList.add('open');
  };

  function closeCalModal() {
    document.getElementById('cal-modal').classList.remove('open');
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
