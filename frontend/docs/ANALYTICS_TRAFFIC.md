# 쓰봉맵 트래픽 Attribution (GA4 보조)

GA4 기본 **session source / medium** 을 임의로 덮어쓰지 않습니다.  
대신 `traffic_attribution_detected` 및 주요 이벤트에 **detected_source / detected_medium** 등을 붙여 (not set) 원인을 분석합니다.

## 환경

| 환경 | GA4 스크립트 | 이벤트 전송 |
|------|----------------|-------------|
| `www.trashbagmap.com`, `trashbagmap.com` | 로드 | 전송 |
| localhost, `*.vercel.app` preview | 미로드(또는 전송 차단) | `console.debug` / `console.table` 만 |
| `NODE_ENV=development` | 미로드 | 디버그만 |

환경 변수: `NEXT_PUBLIC_GA_MEASUREMENT_ID` (비우면 GA 비활성)

## page_view (App Router)

- `gtag('config', …, { send_page_view: false })` — config 자동 page_view 비활성
- `GtagRouteTracker` — 경로·쿼리 변경마다 `page_view` 이벤트 1회 (중복 방지)
- 첫 화면도 트래커에서 1회 전송

## sessionStorage

키: `tbm_traffic_attribution` — **최초 랜딩** 기준 유지.  
새 UTM(`utm_source` / `utm_medium` / `utm_campaign` 변경) 진입 시에만 갱신.

## GA4 맞춤 측정기준 등록 (Admin)

이벤트 범위 custom dimension 권장:

- `detected_source`
- `detected_medium`
- `landing_path`
- `device_type`
- `traffic_debug_reason`
- `has_utm`
- `is_direct`

## 주요 이벤트

| 이벤트 | 설명 |
|--------|------|
| `traffic_attribution_detected` | 세션당 1회, 랜딩 attribution |
| `page_view` | SPA 라우트 |
| `store_detail_open` | 판매처 상세 시트 |
| `copy_address_click` | 주소 복사 |
| `kakao_map_click` | 카카오맵 길찾기 |
| `call_click` | 전화 |
| `share_store_click` | 공유 성공 시 (기존 `share_store_success`와 함께) |
| `purchase_success_click` / `purchase_fail_click` | 구매 피드백 |
| `report_store_click` | 정보 수정요청 |

## 공유 URL UTM

판매처: `utm_source=share&utm_medium=store_detail&utm_campaign=store_share&utm_content={shortCode}`  
지역: `utm_source=share&utm_medium=region_page&utm_campaign=region_share&utm_content={slug}`  

기존 query는 유지, UTM 키가 이미 있으면 덮어쓰지 않음.

## QA 체크리스트

- [ ] Google 검색 유입 → `detected_source=google`, `traffic_debug_reason=referrer_google`
- [ ] 네이버 모바일 검색 → `detected_source=naver`
- [ ] referrer·UTM 없음 → `direct` / `none`, `no_referrer_direct`
- [ ] 공유 링크(`utm_source=share`) → `has_utm=true`, `utm_detected`
- [ ] `store_detail_open` 등에 `detected_source` 동봉
- [ ] localhost: GA 네트워크 요청 없음, `console.table` attribution 확인
- [ ] Vercel preview: GA 미전송, `traffic_debug_reason=preview_or_localhost`
- [ ] GA4 DebugView: `traffic_attribution_detected` 파라미터 확인
- [ ] 라우트 이동 시 `page_view` 중복 없이 경로별 1회

## 로컬 디버그

```bash
# 개발 서버에서 attribution만 확인 (GA 미전송)
npm run dev
# 콘솔: [traffic-attribution], console.table(tbm_traffic_attribution)
```

프로덕션 호스트 검증은 hosts 파일로 `www.trashbagmap.com` → 127.0.0.1 매핑 후 production 빌드로 확인할 수 있습니다.
