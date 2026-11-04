# 연두해요

대한민국 지역을 클릭해 응원 수를 쌓는 로그인 없는 웹앱입니다. 기기마다 같은 서버의 클릭 수를 보고, 매일 한국 시간 00:00에 새로운 지도와 랭킹이 시작됩니다.

## 기능

- 실제 행정구역 지도를 클릭하면 해당 지역의 응원이 1씩 증가합니다.
- 응원이 쌓일수록 흰색 → 연한 연두 → 진한 연두로 바뀝니다.
- 지도 안의 사각형에 지역 약칭과 클릭 수를 표시합니다. 숫자가 길어지면 글꼴이 줄어듭니다.
- 작은 도시의 확대 지도, 지도 확대·축소, 키보드 조작을 지원합니다.
- 모든 기기에 약 3초마다 최신 응원 수를 반영합니다. 자기 클릭은 즉시 표시합니다.
- 순위가 같으면 공동 순위이며, 아직 클릭하지 않은 지역에는 순위를 부여하지 않습니다.
- 전남광주통합특별시는 한 지역으로 집계합니다. 전체 16개 지역입니다.

## 구성

프런트엔드는 HTML/CSS/ES modules, API는 Vercel Node.js Functions, 영구 저장은 Vercel Marketplace의 Upstash Redis를 사용합니다. 데이터베이스 비밀키는 서버에서만 사용하며 브라우저에 전송하지 않습니다.

클릭 저장, 재시도 중복 방지, 간단한 과속 제한은 하나의 원자적 Redis 스크립트에서 처리합니다. 여러 사용자가 동시에 클릭해도 서로의 클릭을 덮어쓰지 않습니다. 동일한 요청 번호로 재전송해도 한 번만 집계합니다.

날짜별 Redis 키를 사용하므로 초기화용 Cron은 필요 없습니다. 한국 시간 자정부터 새 키가 선택되어 모든 지역의 당일 응원이 0에서 시작합니다. 이전 키와 중복 방지 기록은 최대 3일 뒤 자동 삭제합니다. 개발·미리보기·운영 환경의 클릭 수는 서로 분리됩니다.

## 개발

Node.js 24 이상이 필요합니다.

```sh
npm ci
vercel link --project yeonduhaeyo
vercel env pull .env.local --yes
npm run build
npm run dev
```

`http://localhost:3000`에서 실행됩니다. `.env.local`에 Marketplace가 설정한 `KV_REST_API_URL`과 `KV_REST_API_TOKEN`이 필요합니다. 연결이 없으면 서버 연결 대기 상태를 표시합니다.

HTTP 프록시를 사용하는 환경에서는 Node.js의 `NODE_USE_ENV_PROXY=1`을 설정하거나 `node --use-env-proxy server.mjs`로 실행합니다.

## 검증

```sh
npm run check
npm test
```

데이터베이스 환경변수가 있으면 실제 Redis에서 동시 클릭, 같은 요청 재전송, 자정 전후 초기화를 별도의 테스트 키로 검사하고 정리합니다. 운영 카운터는 건드리지 않습니다. 환경변수가 없으면 Redis 통합 테스트만 건너뜁니다.

## 배포

GitHub 저장소의 `main` 브랜치를 Vercel 프로젝트 `yeonduhaeyo`에 연결합니다. 이후 main에 push하면 다시 배포됩니다. 빌드 명령은 `npm run build`, 정적 출력 폴더는 `public`입니다. `/api/scores`는 정적 파일이 아닌 Node.js 함수로 실행됩니다.

Vercel Marketplace에서 연결된 Upstash를 유지해야 기기 간 데이터 공유가 작동합니다. `.env.local`과 `.vercel`은 Git에 올리지 않습니다. 플랜 사용 한도에 도달하면 Vercel/Upstash 대시보드에서 사용량과 플랜을 확인하세요.

지도 원본, 변경 사항과 재생성 방법은 [DATA-SOURCES.md](./DATA-SOURCES.md)를 참고하세요.
