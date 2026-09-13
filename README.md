# guardian-mcp
[![CI](https://github.com/devmango1128/guardian-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/devmango1128/guardian-mcp/actions/workflows/ci.yml)

AI 코딩 에이전트(Claude Code, Claude Desktop, Cursor 등)가 **목표를 달성하려다 저지르는 파괴적인 실수**를 막는 MCP 서버입니다.

> "컴퓨터 용량 좀 줄여줘" → 에이전트가 시스템 드라이브를 지워버리는 사고,
> 권한이 있어도 일어날 수 있습니다. guardian-mcp는 삭제/덮어쓰기 같은
> 되돌리기 힘든 작업을 실행하기 **직전에** 가로채서 검사합니다.

## 무엇을 막아주나요?

세 가지 계층으로 위험한 작업을 판단합니다.

1. **경로 가드 (`pathGuard`)** — `/`, `/System`, `C:\Windows`, 드라이브 루트(`D:\`),
   마운트된 볼륨 전체(`/Volumes/MyDrive`), 사용자의 홈 디렉토리 자체처럼
   시스템 치명적인 경로는 무조건 차단합니다. `GUARDIAN_PROTECTED_PATHS` 환경변수로
   내가 지정한 폴더도 추가로 보호할 수 있습니다.
2. **패턴 가드 (`patternGuard`)** — 대상이 어디든 상관없이 `rm -rf`, `DROP DATABASE`,
   `mkfs`, `diskutil eraseDisk`, WHERE절 없는 `DELETE FROM`, 포크 폭탄 같은
   **알려진 파괴적 명령 시그니처** 자체를 차단합니다.
3. **블래스트 레디어스 가드 (`blastRadius`)** — 삭제 대상의 파일 개수/용량이
   임계치(기본 100개 / 1GB)를 넘으면 자동 실행을 멈추고 확인을 요구합니다.

삭제는 실제 `unlink`가 아니라 **`~/.guardian-mcp/trash`로 이동**시키는 방식으로 구현되어 있어,
승인된 삭제라도 복구할 수 있습니다. 덮어쓰기도 이전 버전을 같은 방식으로 백업합니다.

⚠️ **이 도구는 안전망이지 샌드박스가 아닙니다.** 진짜 효과를 보려면 아래 "왜 클라이언트
설정이 꼭 필요한가" 항목을 반드시 함께 적용하세요.

## 설치

별도 설치 없이 `npx`로 바로 실행할 수 있습니다.

```bash
npx -y guardian-mcp
```

## 사용 방법

### Claude Code / Claude Desktop에 등록하기

`.mcp.json` (프로젝트) 또는 `claude_desktop_config.json` (전역)에 추가하세요.

```json
{
  "mcpServers": {
    "guardian": {
      "command": "npx",
      "args": ["-y", "guardian-mcp"],
      "env": {
        "GUARDIAN_PROTECTED_PATHS": "/Users/me/Documents/important-project,/Users/me/Desktop",
        "GUARDIAN_MAX_FILES": "100",
        "GUARDIAN_MAX_BYTES": "1000000000"
      }
    }
  }
}
```

| 환경변수 | 기본값 | 설명 |
| --- | --- | --- |
| `GUARDIAN_PROTECTED_PATHS` | (없음) | 콤마로 구분한 절대경로 목록. 이 경로들과 그 하위는 항상 삭제/덮어쓰기 차단 |
| `GUARDIAN_MAX_FILES` | `100` | 삭제 대상 파일 개수가 이 값을 넘으면 확인 요구 |
| `GUARDIAN_MAX_BYTES` | `1000000000` (~1GB) | 삭제 대상 총 용량이 이 값을 넘으면 확인 요구 |

### 제공하는 도구

- **`safe_delete({ path, confirm? })`** — 검사 통과 시 대상을 삭제하는 대신 quarantine 폴더로 이동
- **`safe_write({ path, content, overwrite? })`** — 기존 파일이 있으면 `overwrite:true` 필요, 자동 백업
- **`safe_execute({ command })`** — 위험 패턴이 없는 명령만 실행

### 왜 클라이언트 설정이 꼭 필요한가

MCP 서버는 새 도구를 **추가**할 뿐, 클라이언트에 이미 있는 Bash 같은 원본 도구를
막지는 못합니다. 즉 guardian-mcp만 설치해도 에이전트가 원래 Bash 도구로
`rm -rf`를 직접 실행할 길은 여전히 열려 있습니다.

실질적인 보호를 위해 클라이언트의 권한 설정에서 원본 파괴적 명령을 deny하고,
이 서버가 제공하는 `safe_*` 도구만 쓰도록 유도하세요. 예를 들어 Claude Code의
`settings.json`:

```json
{
  "permissions": {
    "deny": [
      "Bash(rm -rf:*)",
      "Bash(rm -fr:*)",
      "Bash(diskutil eraseDisk:*)",
      "Bash(mkfs*:*)"
    ]
  }
}
```

## 개발

```bash
npm install
npm run build   # TypeScript 컴파일
npm test        # vitest — 실제 파일시스템은 격리된 임시 폴더에서만 건드립니다
npm run dev     # tsx로 바로 실행 (stdio)
```

### 테스트 전략

실제 드라이브 삭제를 재현해서 테스트하지 않습니다. 대신:

- `pathGuard` / `patternGuard`의 `classify*()` 함수는 실제 파일 I/O가 전혀 없는 순수
  함수라, 위험한 명령/경로 fixture 목록을 그대로 유닛 테스트에 넣어도 안전합니다.
- `blastRadius`, `safeDelete`, `safeWrite`는 매 테스트마다 `fs.mkdtempSync`로 새로
  만든 격리된 임시 폴더 안에서만 동작을 검증하고, 끝나면 정리합니다.
- CI(GitHub Actions)는 매번 새로 뜨는 일회용 러너이므로 통합 테스트를 안전하게 반복 실행할 수 있습니다.

## 로드맵

- [ ] DB 가드 (SQL 파싱 기반 `DROP`/`DELETE` 차단, 커넥션 후킹)
- [ ] 클라우드 리소스 가드 (S3 버킷 삭제, 프로덕션 인스턴스 종료 등)
- [ ] 실제 OS 휴지통 연동 옵션

## 라이선스

MIT
