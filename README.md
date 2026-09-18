# guardian-mcp

<!-- GitHub에 올린 뒤 devmango1128/guardian-mcp 부분을 실제 repo 경로로 확인해주세요 -->
[![CI](https://github.com/devmango1128/guardian-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/devmango1128/guardian-mcp/actions/workflows/ci.yml)

Guardian MCP는 **AI 코딩 에이전트가 저지르는 흔한 파괴적 실수를 줄이기 위한, 복구 가능한 안전망(safety layer)**을 제공하는 MCP 서버입니다. Claude Code/Desktop뿐 아니라 **MCP를 지원하는 어떤 AI 에이전트/클라이언트**(Cursor, Windsurf, Cline, VS Code Copilot 등)에서도 동일한 방식으로 붙일 수 있습니다.

> "컴퓨터 용량 좀 줄여줘" 같은 평범한 요청도, 에이전트가 그 목표를 달성하는 과정에서 `/Applications`를 통째로 지우거나 시스템 드라이브를 건드리는 식으로 이어질 수 있습니다. 권한이 있어도 일어나는 사고입니다. Guardian MCP는 삭제/덮어쓰기/특정 셸 명령을 실행하기 **직전에** 가로채 검사합니다.

## 현재 상태

개인 프로젝트, v0.2.0, 아직 npm에 publish 전입니다. MCP 프로토콜 레벨 통신(initialize/tools list/tools call)은 직접 검증했지만, **실제 Claude Code/Desktop 같은 클라이언트에서 에이전트가 상시 사용하는 걸 검증한 적은 아직 없습니다.** 외부 보안 감사도 받지 않았고, 아래 위협 모델도 저자 본인의 분석과 테스트를 기반으로 작성된 것입니다. 프로덕션의 유일한 안전장치로 쓰지 말고, 여러 방어선 중 하나로 여겨주세요.

## Guardian MCP가 아닌 것

과장하지 않기 위해 먼저 명확히 합니다.

- **샌드박스가 아닙니다.** OS 권한 시스템을 대체하지 않습니다.
- 클라이언트에 이미 있는 Bash 같은 원본 도구 실행을 **강제로 가로채지 않습니다.** (아래 "클라이언트 설정이 왜 꼭 필요한가" 참고)
- 패턴 기반 명령 탐지는 **우회 불가능성을 보장하지 않습니다.** 의도적으로 난독화된 명령은 통과할 수 있습니다.

대신 이렇게 이해해 주세요: *"AI 코딩 에이전트가 저지르는 흔한 파괴적 실수를 줄여주는, 복구 가능한 안전망."* 막지 못하는 것까지 포함한 전체 위협 모델은 [`THREAT_MODEL.md`](./THREAT_MODEL.md)에 정리했습니다.

## 무엇을 막아주나요?

세 가지 계층으로 위험한 작업을 판단합니다.

1. **경로 가드 (`pathGuard`)** — `/`, `/System`, `/usr`, `/etc`, `C:\Windows` 같은 시스템 치명적 경로와 그 **하위 경로 전체**, 드라이브 루트(`D:\`), 마운트된 볼륨 전체(`/Volumes/MyDrive`), 사용자의 홈 디렉토리 자체를 차단합니다. 심볼릭 링크도 실제 가리키는 대상(`realpath`)까지 따라가서 검사하므로, 링크로 우회하는 것도 막습니다. `GUARDIAN_PROTECTED_PATHS` 환경변수로 내가 지정한 폴더도 추가로 보호할 수 있습니다.
2. **패턴 가드 (`patternGuard`)** — 대상이 어디든 상관없이 `rm -rf`, `find -delete`, `DROP DATABASE`, `shutil.rmtree`, `fs.rmSync`, PowerShell `Remove-Item -Recurse`, 포크 폭탄 같은 **명확히 파괴적인 명령**은 차단(BLOCK)하고, `git clean -fd`, `docker system prune`, `kubectl delete`처럼 **흔히 안전하지만 가끔 파괴적인** 명령은 확인(CONFIRM)을 요구합니다.
3. **블래스트 레디어스 가드 (`blastRadius`)** — 삭제 대상의 파일 개수/용량이 임계치(기본 100개 / 1GB)를 넘거나, 권한 문제 등으로 **정확히 측정할 수 없으면** 자동 실행을 멈추고 확인을 요구합니다. (측정 실패를 "괜찮겠지"하고 조용히 넘어가지 않습니다.)

기준은 이렇습니다: **명확히 위험함 → BLOCK**, **위험 가능성이 있거나 판단 불가 → CONFIRM**, **명확히 안전함 → ALLOW**.

## 복구 가능성 (Quarantine / Restore)

삭제는 실제 `unlink`가 아니라 **`~/.guardian-mcp/trash`로 이동**시키는 방식으로 구현되어 있어, 승인된 삭제라도 복구할 수 있습니다. 덮어쓰기도 이전 버전을 같은 방식으로 백업하며, **쓰기 자체가 실패하면 자동으로 원본을 복원**합니다(임시 파일에 먼저 쓰고 같은 파일시스템 안에서 원자적으로 rename하는 방식이라 실패해도 원본 파일이 빈 채로 남는 상황을 방지합니다).

각 quarantine 항목은 원본 경로, 격리된 경로, 시각, 타입, 크기, 작업 종류를 메타데이터(`~/.guardian-mcp/trash/index.json`)로 추적합니다.

- **`list_trash`** — 현재 격리된 항목 목록과 복구용 id 확인
- **`restore_trash`** — id로 원래 경로에 복구 (원래 자리에 이미 뭔가 있으면 거부)
- **`purge_trash`** — 진짜로 영구 삭제. **아무 기준 없이 호출하면 아무것도 지우지 않습니다** (ids 또는 olderThanDays를 반드시 명시). 먼저 `dryRun:true`로 미리보기하세요. 한 번에 20개 넘게 지우려면 `confirm:true` 필요.

**주의: trash는 자동으로 비워지지 않습니다.** 디스크 용량을 계속 차지하니, 주기적으로 `purge_trash`를 직접 호출해 정리해주세요.

## 설치

> **아직 npm에 publish되지 않았습니다.** 아래 `npx -y safe-agent-mcp`는 publish 이후에나 동작합니다. 그 전까지는 이 저장소를 클론해서 로컬 빌드로 등록해 쓰세요 (바로 아래 "로컬에서 등록하기" 참고).

publish 이후에는 별도 설치 없이 `npx`로 바로 실행할 수 있습니다. (npm 패키지명은 `safe-agent-mcp`이며, 이 GitHub 저장소 이름 `guardian-mcp`와는 다릅니다.)

```bash
npx -y safe-agent-mcp
```

## 사용 방법

### 로컬에서 등록하기 (아직 publish 전)

```bash
git clone https://github.com/devmango1128/guardian-mcp.git
cd guardian-mcp
npm install
npm run build
```

그 다음 `command`/`args`를 `npx` 대신 로컬 빌드 경로로 지정하면 됩니다:

```json
{
  "mcpServers": {
    "guardian": {
      "command": "node",
      "args": ["/absolute/path/to/guardian-mcp/dist/index.js"],
      "env": {
        "GUARDIAN_PROTECTED_PATHS": "/Users/me/Documents/important-project,/Users/me/Desktop"
      }
    }
  }
}
```

### 어떤 MCP 클라이언트에서든 등록하기

Guardian MCP는 표준 MCP stdio 서버입니다. `mcpServers` 설정 형식은 Claude Desktop, Claude Code, Cursor, Windsurf, Cline(VS Code) 등 대부분의 MCP 호환 클라이언트가 동일하게 사용합니다. 클라이언트별 설정 파일 위치만 다릅니다:

| 클라이언트 | 설정 파일 |
| --- | --- |
| Claude Code | 프로젝트의 `.mcp.json` |
| Claude Desktop | `claude_desktop_config.json` |
| Cursor | `.cursor/mcp.json` (프로젝트) 또는 전역 설정 |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Cline (VS Code) | VS Code settings의 `cline.mcpServers` 또는 `cline_mcp_settings.json` |

정확한 파일 위치는 계속 바뀔 수 있으니, 사용 중인 클라이언트의 최신 MCP 설정 문서를 확인하세요. **publish 이후에는** 내용이 어디서든 아래처럼 동일해집니다 (그 전까지는 위 로컬 등록 방식을 쓰세요):

```json
{
  "mcpServers": {
    "guardian": {
      "command": "npx",
      "args": ["-y", "safe-agent-mcp"],
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
| `GUARDIAN_TRASH_DIR` | `~/.guardian-mcp/trash` | quarantine 폴더 위치를 다른 경로로 바꾸고 싶을 때 |

### 제공하는 도구

- **`safe_delete({ path, confirm? })`** — 검사 통과 시 대상을 삭제하는 대신 quarantine 폴더로 이동
- **`safe_write({ path, content, overwrite? })`** — 기존 파일이 있으면 `overwrite:true` 필요, 자동 백업 + 실패 시 자동 복원
- **`safe_execute({ command, confirm? })`** — BLOCK 패턴이 없으면 실행, CONFIRM 패턴은 `confirm:true` 필요
- **`list_trash()`** — quarantine 목록 조회
- **`restore_trash({ id })`** — quarantine에서 원래 위치로 복구
- **`purge_trash({ ids?, olderThanDays?, dryRun?, confirm? })`** — quarantine 영구 삭제 (기본은 아무것도 안 지움)

### 왜 클라이언트 설정이 꼭 필요한가

MCP 서버는 새 도구를 **추가**할 뿐, 클라이언트에 이미 있는 원본 도구(예: Bash)를 막지는 못합니다. 즉 Guardian MCP만 설치해도 에이전트가 원래 도구로 `rm -rf`를 직접 실행할 길은 여전히 열려 있습니다.

실질적인 보호를 위해, 사용 중인 클라이언트가 지원하는 권한/허용 설정에서 원본 파괴적 명령을 deny하고 이 서버가 제공하는 `safe_*` 도구만 쓰도록 유도하세요. 이 메커니즘은 클라이언트마다 이름과 형식이 다릅니다. 예를 들어 Claude Code는 `settings.json`의 `permissions.deny`를 사용합니다:

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

다른 클라이언트를 쓴다면 해당 클라이언트의 문서에서 "tool permission", "deny list", "command allowlist" 같은 기능을 찾아 비슷하게 설정하세요. 이 설정이 없다면 Guardian MCP는 "에이전트가 이 도구를 선택했을 때"만 보호한다는 점을 알아두세요.

## 개발

```bash
npm install
npm run build   # TypeScript 컴파일
npm test        # vitest — 실제 파일시스템은 격리된 임시 폴더에서만 건드립니다
npm run dev     # tsx로 바로 실행 (stdio)
```

### 테스트 전략

실제 드라이브 삭제를 재현해서 테스트하지 않습니다. 대신:

- `pathGuard` / `patternGuard`의 `classify*()` 함수는 실제 파일 I/O가 전혀 없는 순수 함수라, 위험한 명령/경로 fixture 목록을 그대로 유닛 테스트에 넣어도 안전합니다. Windows 경로 판정은 `path.win32`를 직접 사용해 호스트 OS와 무관하게 순수 문자열 로직으로 테스트합니다.
- `blastRadius`, `safeDelete`, `safeWrite`, `quarantine`은 매 테스트마다 `fs.mkdtempSync`로 새로 만든 격리된 임시 폴더(및 `GUARDIAN_TRASH_DIR`로 격리한 임시 trash 폴더) 안에서만 동작을 검증하고, 끝나면 정리합니다.
- 심볼릭 링크 관련 테스트는 권한 문제로 링크를 만들 수 없는 환경(예: 개발자 모드가 꺼진 Windows 러너)에서는 자동으로 skip됩니다.
- CI(GitHub Actions)는 ubuntu/windows/macos 매트릭스로 실행되며, 매번 새로 뜨는 일회용 러너이므로 통합 테스트를 안전하게 반복 실행할 수 있습니다.

## 로드맵

- [ ] DB 가드 (SQL 파싱 기반 `DROP`/`DELETE` 차단, 커넥션 후킹)
- [ ] 클라우드 리소스 가드 (S3 버킷 삭제, 프로덕션 인스턴스 종료 등)
- [ ] trash 자동 정리 정책(옵트인)

## 라이선스

MIT
