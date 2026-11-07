# ✒️ Prompt Archive : Screentone

만화 원고 한 장으로 위장한 NovelAI 성인 장면 프롬프트 생성기예요. 모아 둔 태그 540여 개를 어울리는 것끼리 뽑아, NovelAI V4 이상(V4.5 · V5)의 **기본 프롬프트 · 캐릭터 A · 캐릭터 B** 칸으로 나눠 줘요. 혼자인 장면은 A 칸만, 셋 이상이 나오는 장면은 인원 태그를 기본 칸에 넣고 캐릭터 칸은 A · B 둘까지예요.

> 성인용 태그를 다뤄요. 만 19세 미만은 쓰지 마세요.

## 열기

- **인터넷 주소:** GitHub Pages로 연 주소에서 바로 열려요.
- **내 컴퓨터:** `index.html`을 두 번 눌러 열어요. 설치할 것도, 따로 띄울 것도 없어요.

쓰는 법은 화면 위 `도움말`에 있어요.

## 장면 지시

컷 아래 `장면 지시`를 누르면 카드 창이 떠요. 고른 카드는 그 줄을 잠그고, 나머지는 돌릴 때마다 랜덤이에요. `랜덤` 카드는 잠금을 풀어요. 정해 둔 지시는 원고 위에 한 줄로 보이고, 누르면 다시 열려요.

| 묶음 | 카드 |
|---|---|
| 누가 | 남녀 · 여+여 · 남+남 · 혼자 여 · 혼자 남 · 여2 · 남1 · 남2 · 여1 |
| 어디서 | 없음 · 랜덤 · 침대 · 침실 · 욕실 · 욕조 · 온천 · 소파 · 차 · 교실 · 책상 · 러브호텔 · 실내 |
| 자세 | 랜덤 · 누워서 · 엎드려서 · 올라타서 · 서서 (체위를 그 자세 안에서만) |
| 옷 상태 | 랜덤 · 벗음 · 반쯤 · 입음 |
| 분위기 | 순하게 · 보통 · 세게 (수위 1 · 2 · 3) |
| 그림체 | 안 정함 · 흑백 만화 · 애니 채색 · 동인지 표지 · 수채 · 스케치 |
| 넣을 것 | 옷 · 속옷 · 옷 세부 · 도구 · 표정 · 몸 자세 · 체위 조합 · 행위 (꺼 둔 줄 켜고 끄기) |
| 효과 | 필수 NSFW · 땀 · 말풍선 · 하트 · 투시 · 하트 눈 · 움직임 선 … (끔 → 켬 → 반반) |

카드를 고르면 그 값과 안 맞게 된 다른 잠금은 풀려서 맞춰 바뀌어요. 예를 들어 여+여를 고르면 `penis, pussy`로 잠겨 있던 드러난 곳이 `pussy` 쪽으로 바뀌어요.

## 세 칸으로 나누기

- 이름에 `[A→B]`가 붙은 줄(체위 · 체위 조합 · 행위 · 손·팔 상대)은 A 칸에 `source#`, B 칸에 `target#`을 붙여요. 서로 하는 동작은 두 칸 다 `mutual#`이에요. NovelAI 문서에 있는 여러 캐릭터 동작 표시예요.
- 다리 · 입·키스 줄은 `#방향`에 적힌 값(`another grabbing leg`, `forced kiss` 등)에만 붙어요.
- 방향이 없는 줄은 줄 오른쪽 `기본 · A · B`로 넣을 칸을 바꿔요. 처음에는 인원 · 드러난 곳 · 구도 · 검열 · 장소 · 화풍은 기본, 나머지는 B예요.
- 한 칸에 태그가 여럿 든 값(체위 조합 등)과 방향 있는 줄의 `||` 묶음은 기본 칸으로 가요.
- A · B의 성별은 인원 줄에서 정해요. 남녀면 A boy · B girl. 혼자면 B 칸이 비어요. `A ⇄ B`로 서로 바꿔요.
- 같은 칸 안에서 같은 태그는 한 번만 넣어요.

예시(야망가):

```
기본: nsfw, cum, erotic atmosphere, NSFW scene, 1girl, 1boy, hetero, penis, pussy, from below, censored, bar censor, monochrome, greyscale, comic, halftone, emphasis lines, sound effects, sweat, speech bubble, heart, x-ray, heart-shaped pupils, motion lines
A: boy, source#full nelson, source#struggling
B: girl, nude, target#full nelson, knees to chest, spread pussy, target#struggling, tongue out, upward glance, smeared fluids
```

## 어울리는 것만

뽑을 때 이미 정해진 값과 맞는 것만 골라요. 잠근 값이 이기고, 나머지가 거기에 맞춰 바뀌어요. 줄에서 직접 고를 때는 안 맞는 값이 흐리게 보여요(골라도 돼요).

| 막는 것 | 예 |
|---|---|
| 인원에 없는 몸 | 여자 둘에 `penis` · `fellatio`, 남자 둘에 `pussy` |
| 혼자인데 상대 동작 | `1girl, solo`에 `hug` · `kiss` · A→B 줄 |
| 장소와 자세 | 차 안에 서서 하는 체위, 욕조에 `suspended congress` |
| 체위와 몸 자세 | 서서 하는 체위에 `lying` |
| 마주 봄 · 등 돌림 | `doggystyle` · `sex from behind`에 `kiss` · `arms around neck` · `eye contact` |
| 옷 상태와 옷 | `nude`에 `shirt lift` · `panties`, `fully clothed`에 `topless` |
| 입 | `fellatio` 하면서 `kiss`, 재갈 물고 키스 |
| 손 | 수갑 차고 `touching self` |
| 장소와 옷 | `옷` 줄을 켜면 장소에 맞는 옷만: 책상 → 오피스 룩 · 정장, 욕실 → 목욕가운, 온천 → 유카타, 침대 → 잠옷 · 네글리제 |
| 옷과 옷 세부 | 치마 없는 옷에 `skirt lift`, 원피스 없는 옷에 `dress lift` |
| 시점 | 하는 중인 체위에 `after sex`, 넣기 직전(`imminent penetration`)과 `vaginal` |

A · B 칸도 사람에 맞춰요.

- `fellatio` · `paizuri` · `cowgirl position`처럼 여자가 하는 동작은 남녀일 때 여자 쪽에 `source#`
- `another grabbing thigh`처럼 상대가 나에게 하는 태그는 받는 쪽에만

## 태그 데이터

태그는 `data.js` 하나에 있어요(처음엔 엑셀로 모았다가 옮겼어요). 줄마다 값 한 줄씩, 뜻 · 강도 · 방향과 어울림 성질이 붙어 있어요. 성질의 뜻은 파일 맨 위 주석에 있어요.

```js
{"t": "fellatio", "ko": "펠라치오(입으로 성기를)", "lv": 2, "need": ["m", "pair"], "mouth": "oral", "phase": "during", "by": "f"},
```

켤 때 데이터 검사가 돌아서, 뜻이 빠졌거나 장면 지시 카드가 없는 값을 가리키면 브라우저 콘솔에 알려 줘요.

## 파일

```
PromptArchive-Screentone/
├── index.html   ← 열기
├── data.js      ← 태그 정본
├── app.js
├── styles.css
├── note.js      (받은 컷 TXT · MD · 노트 내보내기)
├── favicon.svg
└── banner1.png · banner2.png
```

## 기술 구성

HTML · CSS · JavaScript만 써요. 서버 · AI API · 외부 라이브러리는 없어요. 마지막 상태는 브라우저 `localStorage`(`screentone:v1`)에 둬요.

## 폰트

시스템 폰트만 써요(Pretendard가 있으면 Pretendard, 없으면 맑은 고딕). 숫자는 Consolas예요.

## 버전

화면 위 상표 옆에 버전이 있어요(`app.js`의 `VERSION`). 올릴 때는 `index.html`에서 파일 뒤에 붙은 `?v=`도 같은 숫자로 바꿔요. 그래야 브라우저가 예전 파일을 섞어 쓰지 않아요.

| 버전 | 바뀐 것 |
|---|---|
| 1.0 | 첫 공개. 프리셋 4 · 수위 · 어울림 검사 · 옷 줄 · 태그 모음 |
| 1.1 | 돌리기 · 장면 지시 · 세 칸 전부 복사를 컷 바로 아래(같은 높이)로, 받은 컷은 그 아래 목록 + 크게 보기 팝업. 태그 모음은 세로 스크롤과 카테고리 칩으로 거르기. 장면 지시 카드 창(누가 · 어디서 · 자세 · 옷 상태 · 분위기 · 그림체 · 넣을 것 · 효과)이 프리셋 · 수위 · 효과 자리를 대신함. 도움말을 탭 넷으로, 태그 모음 창 크기 줄이고 닫기를 ✕로. 창은 바깥을 누르거나 Esc로 닫힘 |

## 라이선스

MIT (`LICENSE`)
