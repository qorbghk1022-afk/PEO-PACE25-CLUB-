export default function Privacy() {
  return (
    <div className="policy-page">
      <h1>PEO 개인정보 처리방침</h1>
      <p>시행일: 2026년 4월 6일</p>
      <p>PEO 운영팀(이하 &quot;운영자&quot;)은 「개인정보 보호법」, 「정보통신망 이용촉진 및 정보보호 등에 관한 법률」 및 관련 법령에 따라 이용자의 개인정보를 보호하고, 이와 관련한 고충을 신속하고 원활하게 처리하기 위하여 다음과 같이 개인정보 처리방침을 수립·공개합니다.</p>

      <h2>제1조 (개인정보의 수집 항목 및 수집 목적)</h2>
      <h3>1. 필수 수집 항목</h3>
      <table className="policy-table">
        <thead><tr><th>수집 항목</th><th>수집 목적</th></tr></thead>
        <tbody>
          <tr><td>이메일 주소</td><td>회원 식별, 로그인, 서비스 공지 발송</td></tr>
          <tr><td>비밀번호</td><td>계정 인증 (암호화 저장)</td></tr>
          <tr><td>닉네임</td><td>서비스 내 표시명</td></tr>
          <tr><td>실명</td><td>본인 확인, 보상 수령자 확인</td></tr>
          <tr><td>전화번호</td><td>본인 확인, 서비스 관련 안내</td></tr>
        </tbody>
      </table>

      <h3>2. 선택 수집 항목</h3>
      <table className="policy-table">
        <thead><tr><th>수집 항목</th><th>수집 목적</th></tr></thead>
        <tbody>
          <tr><td>주소</td><td>협찬 물품 배송 (수령 동의 시에만 수집)</td></tr>
        </tbody>
      </table>

      <h3>3. 서비스 이용 중 자동 수집 항목</h3>
      <table className="policy-table">
        <thead><tr><th>수집 항목</th><th>수집 목적</th></tr></thead>
        <tbody>
          <tr><td>접속 로그, IP 주소</td><td>부정 이용 방지, 서비스 보안 관리</td></tr>
          <tr><td>Strava 연동 데이터</td><td>러닝 기록 연동, 챌린지 성과 반영</td></tr>
        </tbody>
      </table>

      <h2>제2조 (개인정보의 보유 및 이용 기간)</h2>
      <table className="policy-table">
        <thead><tr><th>구분</th><th>보유 기간</th></tr></thead>
        <tbody>
          <tr><td>회원 탈퇴 시</td><td>즉시 파기 (단, 법령상 보존 의무 항목 제외)</td></tr>
          <tr><td>전자상거래 관련 기록</td><td>5년 (전자상거래법)</td></tr>
          <tr><td>접속 로그 기록</td><td>3개월 (통신비밀보호법)</td></tr>
        </tbody>
      </table>

      <h2>제3조 (개인정보의 제3자 제공)</h2>
      <p>운영자는 원칙적으로 이용자의 동의 없이 개인정보를 외부에 제공하지 않습니다. 다만, 다음의 경우는 예외로 합니다.</p>
      <p>• 이용자가 사전에 동의한 경우</p>
      <p>• 법령에 의하여 요구되는 경우</p>
      <p>• Strava는 PEO와 Strava API 연동에 관련된 이용 데이터를 수집·모니터링할 수 있습니다.</p>

      <h2>제4조 (개인정보의 파기 절차 및 방법)</h2>
      <p>이용자의 개인정보는 수집·이용 목적이 달성된 후 지체 없이 파기됩니다. 전자적 파일 형태는 복구 불가능한 방법으로 영구 삭제하며, 종이 문서는 분쇄 또는 소각합니다.</p>

      <h2>제5조 (이용자의 권리와 행사 방법)</h2>
      <p>이용자는 언제든지 자신의 개인정보 열람, 수정, 삭제, 처리정지를 요청할 수 있습니다. 서비스 내 &quot;내 정보&quot; 메뉴에서 직접 수정하거나, 운영자에게 요청할 수 있습니다.</p>

      <h2>제6조 (개인정보의 안전성 확보 조치)</h2>
      <p>운영자는 다음과 같은 조치를 취하고 있습니다.</p>
      <p>• 개인정보 암호화 (AES-256-GCM)</p>
      <p>• 접근 권한 관리 (RLS 정책)</p>
      <p>• 보안 프로그램 설치 및 갱신</p>

      <h2>제7조 (개인정보 보호책임자)</h2>
      <table className="policy-table">
        <thead><tr><th>구분</th><th>내용</th></tr></thead>
        <tbody>
          <tr><td>담당자</td><td>PEO 운영팀</td></tr>
          <tr><td>연락처</td><td>서비스 내 문의</td></tr>
        </tbody>
      </table>

      <h2>제8조 (개인정보 처리방침의 변경)</h2>
      <p>본 방침은 시행일로부터 적용되며, 변경 사항이 있을 경우 서비스 내 공지를 통해 안내합니다.</p>
    </div>
  )
}
