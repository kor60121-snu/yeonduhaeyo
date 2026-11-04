# 지도와 행정구역

## 경계 원본

- [southkorea/southkorea-maps — KOSTAT 2018](https://github.com/southkorea/southkorea-maps/tree/master/kostat/2018/json)
- 사용 파일: `skorea-provinces-2018-geo.json`, `skorea-municipalities-2018-geo.json`
- 원본 저장소의 라이선스 안내: KOSTAT 자료는 공유·수정 가능(“Free to share or remix”). 비상업용으로 제한된 GADM 자료는 사용하지 않았습니다.

## 앱에서 반영한 변경

- 전남과 광주의 도형을 합쳐 전남광주통합특별시로 집계합니다. [행정안전부의 2026년 7월 1일 통합 출범 안내](https://mois.go.kr/frt/bbs/type010/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000008&nttId=126845)를 기준으로 했습니다.
- 군위군 도형을 경상북도에서 빼고 대구광역시에 합쳤습니다.
- 강원특별자치도, 전북특별자치도 명칭을 적용했습니다.
- 도서와 해안선을 단순화했습니다. 울릉도·독도와 서해 일부 도서는 별도 위치의 보조 지도에 표시합니다. 이 지도는 클릭 게임용이며 측량·법적 경계 확인에 사용하지 않습니다.
- 16개 지역의 이름·점수 카드를 본지도에서 모두 같은 크기(지도 좌표 기준 140×76)로 표시합니다. 가까운 지역의 카드는 서로 겹치지 않도록 배치합니다.
- 모든 카드는 읽기와 터치를 위해 주변 경계에 걸칠 수 있습니다. 카드 전체를 누르면 카드에 적힌 지역에만 1회 합산됩니다.

## 재생성

원본 파일을 내려받은 뒤 Python과 `shapely`가 있는 환경에서 실행합니다.

```sh
python scripts/build-map.py /path/skorea-provinces-2018-geo.json /path/skorea-municipalities-2018-geo.json
```

Vercel 빌드에서는 Python을 실행하지 않고, 저장소에 포함된 `public/map.json`을 그대로 사용합니다.
