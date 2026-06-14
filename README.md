# 🟠 Bézier Inspector  
![Overview](overview.png)

**Bézier Inspector** is a CEP extension for Adobe Illustrator that visualizes Bézier geometry directly on the artboard.  
**Bézier Inspector**는 Adobe Illustrator에서 선택한 벡터/텍스트의 Bézier 구조를 아트보드 위에 직접 표시해주는 CEP 확장입니다.

---

## ✨ Features / 주요 기능

Bézier Inspector can draw:  
Bézier Inspector는 아래 항목을 표시할 수 있습니다.

- Anchor points / 앵커 포인트
- Bézier handles / Bézier 핸들
- Handle connector lines / 핸들 연결선
- Baseline guide / 베이스라인 가이드
- x-height guide / x-height 가이드
- Cap height guide / Cap height 가이드
- Ascent guide / 어센트 가이드
- Descent guide / 디센트 가이드
- Live overlay layer inside Illustrator / Illustrator 내부 라이브 오버레이 레이어

---

## 📦 Package contents / 패키지 구성

```text
BezierInspector_Free_Distribution_v1_0_2/
├── com.ju.bezierinspector/
│   ├── CSXS/
│   │   └── manifest.xml
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   └── main.js
│   ├── jsx/
│   │   └── host.jsx
│   ├── lib/
│   │   ├── CSInterface.js
│   │   └── opentype.min.js
│   └── index.html
├── install.sh
├── repair.sh
├── uninstall.sh
├── diagnostics.sh
├── scripts/
│   ├── build_zxp_self_signed.sh
│   └── install_zxp_with_upia.sh
├── tools/
│   └── PLACE_ZXPSignCmd_HERE.txt
├── zxp_out/
│   └── ZXP_OUTPUT_GOES_HERE.txt
├── zxp_source_com.ju.bezierinspector.zip
├── CHECKSUMS.txt
├── VERSION.txt
└── README.md
```

---

## ✅ Recommended installation / 권장 설치 방법

Use `install.sh` unless you specifically need the ZXP workflow.  
특별히 ZXP 방식이 필요한 경우가 아니라면 `install.sh` 설치를 권장합니다.

### Step 1 / 1단계

Quit Adobe Illustrator completely.  
Adobe Illustrator를 완전히 종료하세요.

### Step 2 / 2단계

Unzip the downloaded file.  
다운로드한 ZIP 파일의 압축을 푸세요.

### Step 3 / 3단계

Open Terminal and go to the unzipped folder.  
Terminal을 열고 압축을 푼 폴더로 이동하세요.

Example / 예시:

```bash
cd ~/Downloads/BezierInspector_Free_Distribution_v1_0_2
```

### Step 4 / 4단계

Run the installer.  
설치 스크립트를 실행하세요.

```bash
bash install.sh
```

### Step 5 / 5단계

Restart Illustrator.  
Illustrator를 다시 실행하세요.

### Step 6 / 6단계

Open Bézier Inspector from:  
아래 메뉴에서 Bézier Inspector를 여세요.

```text
Window → Extensions (Legacy) → Bézier Inspector
```

---

## 🩶 Gray panel fix / 회색 패널 복구

If the panel opens as a blank gray window, quit Illustrator first.  
패널이 빈 회색 화면으로 열리면 먼저 Illustrator를 종료하세요.

Then run:  
그 다음 아래를 실행하세요.

```bash
bash repair.sh
```

After the repair finishes, restart Illustrator and open:  
복구가 끝나면 Illustrator를 다시 실행하고 아래 메뉴에서 여세요.

```text
Window → Extensions (Legacy) → Bézier Inspector
```

`repair.sh` will:  
`repair.sh`는 아래 작업을 자동으로 처리합니다.

- Re-enable CEP PlayerDebugMode / CEP PlayerDebugMode 재설정
- Remove macOS quarantine attributes / macOS quarantine 속성 제거
- Fix file permissions / 파일 권한 수정
- Clear CEP cache / CEP 캐시 삭제
- Print duplicate extension folders / 중복 설치 폴더 출력

---

## 🧪 Diagnostics / 진단 로그

If installation still fails, run:  
설치 후에도 문제가 있으면 아래를 실행하세요.

```bash
bash diagnostics.sh
```

The script creates a diagnostic log that can be sent for troubleshooting.  
문제 확인용 진단 로그가 생성됩니다.

The log usually includes:  
로그에는 보통 아래 정보가 포함됩니다.

- macOS version / macOS 버전
- CEP extension folder paths / CEP 확장 폴더 경로
- Duplicate installation check / 중복 설치 확인
- PlayerDebugMode values / PlayerDebugMode 값
- File permissions / 파일 권한
- Quarantine attributes / quarantine 속성
- CEP cache status / CEP 캐시 상태

---

## 🗑 Uninstall / 제거

To uninstall Bézier Inspector, quit Illustrator and run:  
Bézier Inspector를 제거하려면 Illustrator를 종료한 뒤 아래를 실행하세요.

```bash
bash uninstall.sh
```

This removes the installed extension folder from:  
아래 위치에 설치된 확장 폴더를 제거합니다.

```text
~/Library/Application Support/Adobe/CEP/extensions/com.ju.bezierinspector
```

---

## 🧩 Optional ZXP workflow / 선택 사항: ZXP 방식

This package includes scripts for creating a self-signed ZXP package.  
이 패키지에는 self-signed ZXP 패키지를 만들 수 있는 스크립트가 포함되어 있습니다.

This is optional. Most users should use `install.sh`.  
이 방식은 선택 사항입니다. 대부분의 사용자는 `install.sh`를 사용하면 됩니다.

### 1. Prepare ZXPSignCmd / ZXPSignCmd 준비

Adobe `ZXPSignCmd` is not included.  
Adobe `ZXPSignCmd` 실행 파일은 포함되어 있지 않습니다.

Place the executable here:  
실행 파일을 아래 위치에 넣으세요.

```text
tools/ZXPSignCmd
```

Then make it executable:  
그 다음 실행 권한을 부여하세요.

```bash
chmod +x tools/ZXPSignCmd
```

### 2. Build self-signed ZXP / self-signed ZXP 생성

Run:  
아래를 실행하세요.

```bash
bash scripts/build_zxp_self_signed.sh
```

If successful, the ZXP file will be created here:  
성공하면 아래 위치에 ZXP 파일이 생성됩니다.

```text
zxp_out/bezier_inspector.zxp
```

### 3. Install ZXP with ZXPInstaller / ZXPInstaller로 설치

1. Quit Illustrator.  
   Illustrator를 종료하세요.

2. Open ZXPInstaller.  
   ZXPInstaller를 여세요.

3. Drag this file into ZXPInstaller:  
   아래 파일을 ZXPInstaller에 드래그하세요.

```text
zxp_out/bezier_inspector.zxp
```

4. Restart Illustrator.  
   Illustrator를 다시 실행하세요.

5. Open:  
   아래 메뉴에서 여세요.

```text
Window → Extensions (Legacy) → Bézier Inspector
```

### 4. Install ZXP with Adobe UPIA / Adobe UPIA로 설치

If you prefer Adobe UPIA, run:  
Adobe UPIA를 사용하려면 아래를 실행하세요.

```bash
bash scripts/install_zxp_with_upia.sh
```

The script looks for Adobe Unified Plugin Installer Agent in the standard Creative Cloud Desktop path.  
이 스크립트는 Creative Cloud Desktop에 포함된 Adobe Unified Plugin Installer Agent의 기본 경로를 사용합니다.

--

## 🔧 Manual install reference / 수동 설치 참고

If you need to install manually, copy this folder:  
수동 설치가 필요하면 아래 폴더를 복사하세요.

```text
com.ju.bezierinspector
```

To:  
아래 위치로 복사합니다.

```text
~/Library/Application Support/Adobe/CEP/extensions/
```

The final path should be:  
최종 경로는 아래와 같아야 합니다.

```text
~/Library/Application Support/Adobe/CEP/extensions/com.ju.bezierinspector
```

Then run:  
그 다음 아래를 실행하세요.

```bash
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
defaults write com.adobe.CSXS.13 PlayerDebugMode 1

EXT="$HOME/Library/Application Support/Adobe/CEP/extensions/com.ju.bezierinspector"
xattr -dr com.apple.quarantine "$EXT"
chmod -R u+rwX "$EXT"
rm -rf "$HOME/Library/Caches/CSXS/cep_cache"
```

Restart Illustrator after running the commands.  
명령 실행 후 Illustrator를 다시 시작하세요.

---

## 🆘 Troubleshooting / 문제 해결

### The extension does not appear / 확장이 메뉴에 보이지 않음

Run:  
아래를 실행하세요.

```bash
bash repair.sh
```

Then restart Illustrator and check:  
그 다음 Illustrator를 재시작하고 아래 메뉴를 확인하세요.

```text
Window → Extensions (Legacy)
```

### The panel is gray / 패널이 회색으로 뜸

Run:  
아래를 실행하세요.

```bash
bash repair.sh
```

If it is still gray, run:  
그래도 회색이면 아래를 실행하세요.

```bash
bash diagnostics.sh
```

Send the generated log for troubleshooting.  
생성된 로그를 문제 확인용으로 전달하세요.

### Browser opens index.html but Illustrator is gray / 브라우저에서는 열리지만 Illustrator에서는 회색

This usually means the issue is in the local CEP runtime environment, not the HTML file itself.  
이 경우는 보통 HTML 자체 문제가 아니라 로컬 CEP 런타임 환경 문제입니다.

Run:  
아래를 실행하세요.

```bash
bash repair.sh
```

Then restart Illustrator.  
그 다음 Illustrator를 재시작하세요.

---

## 📌 Version / 버전

```text
Bézier Inspector v1.0.2
Free Distribution Build
CEP Extension for Adobe Illustrator
```

