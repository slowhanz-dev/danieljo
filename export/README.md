# BUNNAR Export · 수출 실무 관리 시스템

> 개발 지시서 v1.0에 대한 설계안 및 최초 버전(v0.1) 구현 설명
> 경로: `/export/` (기존 BUNNAR OS `/app/`과 완전히 분리)

---

## 1. 개발 구조 (Architecture)

| 항목 | 결정 | 이유 |
|---|---|---|
| 형태 | 정적 웹앱 (HTML + CSS + JS, 빌드 도구 없음) | 기존 BUNNAR OS와 같은 방식이라 GitHub Pages에 그대로 배포되고, 나중에 통합하기 쉬움 |
| 파일 | `index.html` · `export.css` · `export.js` | 화면·스타일·로직만 분리. 서버 없음 |
| 데이터 저장 | 브라우저 `localStorage` (주문·문서 데이터) + `IndexedDB` (첨부파일) | 고객정보·은행정보·송금증이 **공개 저장소나 서버로 나가지 않음** |
| 백업 | JSON 전체 백업(첨부 포함 옵션) · JSON 복원 · CSV 내보내기 | 지시서 9항 |
| PDF | 브라우저 인쇄 → "PDF로 저장" (A4 인쇄 스타일) | 별도 라이브러리 없이 BUNNAR 인보이스 디자인을 그대로 출력 |
| 외부 의존 | Pretendard 웹폰트만 사용 | 오프라인에서도 동작 |

**보안 원칙**

- 저장소에는 코드와 **익명화된 예시 데이터**만 들어 있습니다. 판매자 주소·사업자번호·은행정보는 비어 있으며 `설정`에서 입력하면 해당 브라우저에만 저장됩니다.
- 데이터는 기기·브라우저 단위로 저장됩니다. 다른 PC에서 쓰려면 JSON 백업 파일을 옮겨 복원합니다. 백업 파일은 민감정보를 담고 있으므로 저장소에 올리지 않습니다.

---

## 2. 화면 설계 (Screens)

### 2-1. 홈 · 수출 현황 (Overview)
- 상단: 8단계 가로 다이어그램. 단계마다 그 단계에 있는 수출 건 수를 표시합니다.
- 하단: 거래처별 수출 건 목록. 고객·국가·주문 총액·결제 상태·현재 단계·다음 할 일·출고 예정일·배송 방식을 보여 줍니다.

### 2-2. 수출 건 작업 화면 (Workspace) — 메인
- 상단 요약: 고객, 국가, 주문 총액, 실입금액, 잔액, 현재 단계, 다음 할 일
- **가로형 8단계 카드**입니다. 카드마다 아래 내용이 직접 들어갑니다.
  1. 단계 설명
  2. 실행 체크리스트. `자동` 항목은 데이터로 판정하므로 손으로 체크할 수 없습니다(실수 방지).
  3. 단계별 핵심 수치와 경고
  4. 문서 생성 버튼(QT/PI/FI/CI/PL/Mark/이메일/내부용)
  5. 첨부파일 등록·열기
  6. 진행 상태 (대기 / 진행 중 / 완료)
  7. 다음 업무 안내
- 큰 편집(품목표, 배송 구성, 결제 기록)은 카드 버튼을 누르면 오른쪽 **편집 패널**에서 열립니다. 화면을 옮겨 다닐 필요가 없습니다.
- 하단: 상담 기록·시스템 이력 타임라인, 전체 문서 목록(버전·상태)

### 2-3. 문서 편집기 (Document Editor)
- 왼쪽에는 편집 항목(발행일, 옵션 표기, 결제 조건 문구, 노트), 오른쪽에는 A4 미리보기가 있습니다.
- 자동 검산 결과(라인 금액·합계)를 보여 주고, 발행 전 경고(HS코드 미확정, 주문과 불일치 등)를 표시합니다.
- 문서 상태: `초안 Draft → 발행 Issued → 대체됨 Superseded / 무효 Void`
- 발행된 문서는 **수정할 수 없습니다**. 고칠 때는 `수정본(R1, R2…)`을 새로 발행하고, 이전 본은 이력으로 남습니다.

### 2-4. 설정 (Settings)
- 판매자 정보, 은행 정보(로컬 전용), 가격 정책(구간·할인율·VAT 방식·기본 환율), 제품 목록(국문/영문명, VAT 포함 소비자가, 세트당 피스 수, 중량, 재고, HS코드·확인 상태)
- 데이터: 백업, 복원, CSV, 예시 데이터 불러오기, 초기화

---

## 3. 데이터 모델 (BUNNAR OS 연동용 공통 구조)

스키마 식별자는 `bunnar.export/1`입니다. 모든 객체는 `id`(문자열)를 가지며, 금액은 USD 소수 둘째 자리 숫자로 저장합니다.

```text
Store
├─ settings
│   ├─ seller   { company, address, regNo, email, web, phone, signer }
│   ├─ bank     { bank, swift, beneficiary, account, note }        ← 로컬 전용
│   ├─ pricing  { tiers[{min,max,discount,negotiable,note}], vatRate, vatMode, fxRate, fxDate }
│   └─ defaults { incoterms, origin, dimDivisor(5000), shipRequires }
├─ products[]   { id, sku, nameEn, nameKo, priceKrw(VAT포함), piecesPerSet, weightKg, stock, hsCode, hsStatus }
└─ deals[]  ← 거래처별 독립 수출 프로세스
    ├─ code, createdAt, updatedAt, archived, todo(메모)
    ├─ customer  { name, contact, country, cc, email, phone, billAddress, shipAddress, notes }
    ├─ pricing   { fxRate, fxDate, discount, discountAuto, vatMode }   ← 생성 시점 정책을 복사(이후 정책 변경 영향 없음)
    ├─ items[]   { id, productId, desc, qty, piecesPerSet, priceKrw, unitUsd, manual, backorder, hsCode }
    ├─ charges[] { id, label, amount }                     ← 국내 배송비·인쇄비 등 별도 청구
    ├─ terms     { type: full|deposit, depositPct, shipRequires: full|deposit }
    ├─ payments[]{ id, kind: receipt(송금증)|credited(실입금), date, amount, krw, ref, fileId }
    ├─ shipments[]{ id, no, method: DHL|EMS|forwarder|other, account: buyer|seller,
    │               accountNo, accountApproved, approvalRef, alloc{itemId:qty},
    │               boxes[{id,l,w,h,gw,nw,contents}], inspected, plannedDate, pickupBooked,
    │               awb, shippedAt, declMode: unset|formal|courier|none, declNo,
    │               declAccepted, exportDone }
    ├─ docs[]    { id, type: QT|PI|FI|CI|PL|MARK|KR, no, rev, originalNo, shipmentId,
    │               status: draft|issued|superseded|void, edits{}, snapshot{} }
    ├─ files[]   { id, kind, name, mime, size, stage, shipmentId }  ← 실제 파일은 IndexedDB
    ├─ checks{}  수동 체크리스트 상태
    ├─ verify[]  { key, label, status: pending|ok|na, note }   ← "확인 필요" 항목
    ├─ logs[]    { id, at, kind: note|system|email, text }
    └─ settlement{ costs[{label,krw}], note }
```

**발행 문서 = 스냅샷.** 발행할 때 그 시점의 판매자·고객·품목·단가·환율·노트를 `snapshot`에 고정합니다. 그래서 가격 정책이나 제품 가격을 바꿔도 이미 발행한 견적·인보이스에는 반영되지 않습니다(지시서 5항).

---

## 4. 가격 계산

```text
단가(USD) = 기준가(VAT 포함 소비자가, KRW) × (1 − 할인율) [÷ (1 + VAT)] ÷ 환율   → 소수 둘째 자리 반올림
라인 금액 = 수량 × 단가            → 반올림 후 합산(합계 자동 검산)
```

- 할인 구간 기본값은 30–99개 25%, 100–299개 30%, 300개 이상 33%(33~35% 개별 협의)이며 설정에서 바꿀 수 있습니다.
- 수량 기준은 주문 전체 세트 수입니다. 최소 주문 수량 산정 방식은 **확인 필요** 상태로 둡니다.
- **VAT 처리 방식은 설정 항목입니다.** 기본값은 "VAT 포함가에 할인만 적용(별도 VAT 차감 없음)"입니다. `한 번만 차감` 방식을 고르면 ÷1.1을 딱 한 번 적용합니다. 두 번 차감되는 경로는 없습니다. ⚠️ 어느 방식이 맞는지는 대표 확인이 필요합니다.
- 라인별 단가 수동 입력이 가능합니다(협의가, 기발행 단가 유지). 수동 단가에는 `수동` 표시가 붙습니다.

---

## 5. 실수 방지 기능 (지시서 7항 대응)

| 요구 | 구현 |
|---|---|
| 송금증 수령 ≠ 실제 입금 | 결제 기록을 `송금증(receipt)`과 `실입금(credited)`으로 나눕니다. 잔액·출고 조건은 실입금만 계산합니다 |
| 입금 미확인 시 출고 제한 | 배송별 `출고 완료` 버튼은 출고 조건을 모두 충족할 때만 활성화되고, 미충족 사유를 목록으로 보여 줍니다 |
| 단가·수량·합계 자동 검산 | 문서 미리보기마다 라인·소계·총액을 검산해 결과를 표시합니다 |
| 선금·잔금 자동 계산 | 결제 조건(전액/선금 %)에 따라 선금액과 잔금(FI = 상품대금 + 별도 비용 − 실입금 인정액)을 계산합니다 |
| 인보이스 수정 이력 | 발행본은 잠깁니다. 수정본 R1, R2…을 발행하면 이전 본은 `대체됨`으로 보존되고 원 문서 번호가 표기됩니다 |
| 분할 배송 | 배송(Shipment)마다 품목 수량을 배정하고, 주문 수량 초과 배정을 막습니다. CI·PL·Mark는 배송별로 생성합니다 |
| 주문 총액 ≠ 통관 가액 | CI는 해당 배송 물품의 가액만 표시하고, "주문 총액 / 이번 배송 통관가액"을 함께 보여 줍니다 |
| DHL 고객 계정 승인 | 고객 계정으로 배송할 때는 승인 확인과 승인 근거를 입력해야 출고할 수 있습니다 |
| 박스 부피무게 | 박스마다 가로×세로×높이 ÷ 5000으로 계산하고, 실중량과 비교해 청구 중량(0.5kg 올림)을 구합니다 |
| 수출신고 ≠ 수출이행 | `신고 수리`와 `수출이행(선적) 완료`를 따로 체크합니다. 수출이행 완료는 출고 이후에만 가능합니다 |
| 백오더 | 백오더 표시 품목이 들어간 배송은 입고를 확인하기 전에 출고할 수 없습니다 |

출고 조건: 필요 입금액 실입금 · 배송 품목 배정 · 검수 · 박스 정보 · (국제 특송) CI·PL 발행 · 운송장 번호 · 수출신고 방식 결정 · 고객 계정 승인(해당 시) · 백오더 해소

---

## 6. 문서 생성 시스템

| 코드 | 문서 | 언어 | 단위 |
|---|---|---|---|
| QT | Quotation 견적서 | 영문 | 주문 |
| PI | Proforma Invoice 결제 요청 | 영문 | 주문 (수정본 R1…) |
| FI | Final Invoice 최종 잔금 청구 | 영문 | 주문 |
| CI | Commercial Invoice 상업송장 | 영문 | 배송별 |
| PL | Packing List 포장명세서 | 영문 | 배송별 |
| MARK | Shipping Mark 배송 라벨 | 영문 | 배송별(박스마다 1장) |
| KR | 내부 검토용 인보이스 | 한글·원화 | 주문 |
| EMAIL | 고객 응대 이메일 (7종 템플릿) | 영문 | 상담 기록에 저장 |

- 디자인은 기존 BUNNAR PI(PI-AU-20261120-01A, R1)의 레이아웃을 따릅니다. 로고, Seller/Invoice Details, Bill To/Ship To, 회색 헤더 표, TOTAL 바, Payment Schedule, Bank Transfer Details, Notes, 푸터 순서입니다.
- 문서 번호 규칙은 `{유형}-{국가코드}-{YYYYMMDD}-{순번}A`이고 수정본은 `-R{n}`을 붙입니다. 배송별 문서는 `-S{n}`을 붙입니다.
- **운송장·수출신고필증은 생성하지 않고 공식 문서를 첨부만 합니다.** 자체 생성 문서에는 공식 문서처럼 보이는 표시를 넣지 않습니다.

---

## 7. 구현 계획 및 현재 상태

| 차수 | 범위 | v0.1 상태 |
|---|---|---|
| 1차 | 카드형 수출 프로세스, 거래처(수출 건) 관리, 상담 기록 | ✅ 구현 |
| 2차 | 가격 계산(구간 할인·환율·VAT 방식), QT/PI/FI/CI/PL/Mark/KR 문서 생성, 이메일 템플릿, 버전 관리 | ✅ 구현 |
| 3차 | 결제(송금증/실입금), 포장(박스·부피무게), 수출신고·운송장 첨부, 출고 게이트, 정산(원화·비용·마진), 확인 필요 항목 | ✅ 기본 구현 |
| 4차 | 실무 테스트 → 피드백 반영 → BUNNAR OS 통합 검토 | ⏳ 다음 단계 |

### 다음 단계 제안
1. **실무 테스트**: `설정 → 예시 데이터 불러오기`로 호주(분할 배송, 고객 DHL 계정)·대만(선금/잔금, 국내 지정 물류) 시나리오를 확인합니다.
2. 대표 확정이 필요한 항목:
   - VAT 처리 방식
   - 최소 주문 수량 산정 방식
   - 제품별 기준가(KRW)
   - HS코드
   - Incoterms 표기
   - 영세율·직접 수출실적 인정 여부
3. 여러 기기에서 쓸 필요가 생기면 BUNNAR OS의 Google 연동(Drive) 쪽에 백업/동기화를 붙이는 방안을 검토합니다. 공개 저장소에는 데이터를 올리지 않습니다.

### 세무·통관 미확정 항목
HS코드, 영세율, 수출실적 인정, 수출신고 방식은 기본값이 `확인 필요`입니다. 앱이 임의로 확정하지 않으며, 담당자가 확인한 뒤 `확인됨`으로 바꿉니다.
