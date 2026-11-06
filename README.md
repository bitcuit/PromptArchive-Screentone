# ✒️ Prompt Archive : Screentone

만화 원고 한 장으로 위장한 NovelAI 성인 장면 프롬프트 생성기예요. 엑셀에 모아 둔 태그를 뽑아, NovelAI V4 이상(V4.5 · V5)의 **기본 프롬프트 · 캐릭터 A · 캐릭터 B** 칸으로 나눠 줘요. 혼자인 장면은 A 칸만, 셋 이상이 나오는 장면은 인원 태그를 기본 칸에 넣고 캐릭터 칸은 A · B 둘까지예요.

> 성인용 태그를 다뤄요. 만 19세 미만은 쓰지 마세요.

## 열기

- **인터넷 주소:** GitHub Pages로 연 주소에서는 바로 열려요.
- **내 컴퓨터:** `켜기.bat`을 두 번 눌러요. `index.html`을 두 번 눌러 열면 브라우저가 옆의 엑셀 읽기를 막아요. `켜기.bat`은 이 폴더를 내 컴퓨터 안에서만 열리는 주소(`127.0.0.1:8765`)로 띄워요. 작은 검은 창이 떠 있는 동안 열려요(파이썬 필요).

쓰는 법은 화면 위 `도움말`에 있어요.

## 프리셋

콘티 위 단추 하나로 수위 · 줄 섞기 · 켤 줄 · 효과를 한꺼번에 맞춰요. 누를 때마다 엑셀의 처음 상태로 되돌린 뒤 적용해요.

| 프리셋 | 이런 그림 |
|---|---|
| 기본 | 컬러 한 장. 수위 2, 센 태그 없이 |
| 야망가 | 흑백 성인 만화 컷. 망점 · 집중선 · 효과음 · 말풍선 · 하트 눈 · 투시 |
| 순애 | 다정한 분위기, 침대 위. 수위 1 |
| 하드 | 구속 도구 · 거친 행위. 수위 3 |
| 막 섞기 | 모든 줄을 켜고 반반으로 섞기 |

프리셋은 엑셀의 `#프리셋` 시트에서 고치거나 더해요.

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

## 엑셀

태그는 같은 폴더의 `Screentone 태그.xlsx` 하나에서 읽어요. 고쳐 저장한 뒤 `다시 읽기`를 누르면 새로 읽어요. 잠근 줄 · 스위치는 그대로예요.

- 랜덤 시트(기본 · 체위 · 몸 · 사후 · 구도): 첫 줄 = 줄 이름, 그 아래 = 뽑을 값. 열 하나가 한 줄이에요. 한 칸에 `a, b`처럼 여러 태그를 넣으면 같이 나와요.
- `켜고끄기` 시트: 이름 · 켜면 · 끄면 · 처음 · 위치(앞 / 뒤) · 뜻.
- 표시: 줄 이름 앞 `-` = 처음엔 꺼 둠, 값 앞 `*` = 처음 값(잠긴 채로), 시트 이름 앞 `#` = 메모 시트.
- 태그 칸에 마우스를 올리면 한국어 뜻(셀 메모)이 보여요.

| 메모 시트 | 하는 일 |
|---|---|
| `#프리셋` | 프리셋 단추. 수위 · 줄 섞기 · 고를 값(`줄=값 ; 줄=값`) · 켤 것 · 끌 것 |
| `#뜻` | 줄 아래 작은 한국어 뜻 |
| `#방향` | `A→B`면 `source#` / `target#`, `서로`면 `mutual#` |
| `#강도` | 1 순하게 · 2 보통 · 3 세게. 수위보다 센 값은 랜덤에서 빠져요 |
| `#단부루` | 태그마다 단부루 판정. 화면에는 안 보이고 태그 모음의 `단부루 태그만` 거르기에만 써요. 랜덤 시트 칸 색: 노랑 = 별칭 섞임, 주황 = 단부루에 없는 태그 섞임 |

## 파일

```
PromptArchive-Screentone/
├── index.html
├── 켜기.bat                 ← 내 컴퓨터에서 열기
├── Screentone 태그.xlsx     ← 태그 정본
├── styles.css
├── app.js
├── note.js                  (받은 컷 TXT · MD · 노트 내보내기)
└── vendor/xlsx.full.min.js  (엑셀 읽기)
```

## 기술 구성

HTML · CSS · JavaScript만 써요. 서버 · AI API는 없어요. 엑셀은 [SheetJS](https://sheetjs.com/)(Apache 2.0)로 브라우저에서 읽어요. 마지막 상태는 브라우저 `localStorage`(`screentone:v1`)에 둬요.

## 폰트

시스템 폰트만 써요(Pretendard가 있으면 Pretendard, 없으면 맑은 고딕). 숫자는 Consolas예요.

## 라이선스

MIT (`LICENSE`). `vendor/xlsx.full.min.js`는 SheetJS의 Apache 2.0 라이선스를 따라요.
