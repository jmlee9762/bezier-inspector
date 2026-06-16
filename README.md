# 🟠 Bézier Inspector

![Overview](overview.png)

Bézier Inspector is a CEP extension for Adobe Illustrator that visualizes Bézier geometry directly on the artboard.

Bézier Inspector는 Adobe Illustrator에서 선택한 벡터와 텍스트의 Bézier 구조를 아트보드 위에 직접 표시해주는 CEP 확장입니다.

---

# 📦 Download

## Important

Please download the ZIP from:

```text
Releases → Assets
```

Do NOT use:

```text
Code → Download ZIP
```

GitHub's green "Code → Download ZIP" button downloads the entire repository and may result in an incorrect folder structure.

---

# 🚀 Installation

## macOS

1. Quit Illustrator.

2. Download and unzip:

```text
BezierInspector_Free_Distribution.zip
```

3. Open Terminal.

4. Navigate to the unzipped folder.

Example:

```bash
cd ~/Downloads/BezierInspector_Free_Distribution
```

5. Run:

```bash
bash install.sh
```

6. Restart Illustrator.

7. Open:

```text
Window → Extensions (Legacy) → Bézier Inspector
```

Korean UI:

```text
창 → 확장 기능(레거시) → Bézier Inspector
```

---

## Windows

1. Quit Illustrator.

2. Download and unzip:

```text
BezierInspector_Free_Distribution.zip
```

3. Open the unzipped folder.

4. Double-click:

```text
install_windows.bat
```

⚠️ Do NOT run:

```bash
bash install.sh
```

`install.sh` is for macOS only.

5. Restart Illustrator.

6. Open:

Illustrator 2022:

```text
Window → Extensions → Bézier Inspector
```

Illustrator 2023–2026:

```text
Window → Extensions (Legacy) → Bézier Inspector
```

Korean UI:

```text
창 → 확장 기능
```

or

```text
창 → 확장 기능(레거시)
```

---

# 🩶 Gray Panel Fix

If the panel opens as a blank gray window:

## macOS

```bash
bash repair.sh
```

## Windows

Double-click:

```text
repair_windows.bat
```

Then restart Illustrator.

---

# 🧰 Manual Installation (Advanced Users Only)

Most users should use the installer.

Only use manual installation if the installer fails.

## macOS

Copy:

```text
com.ju.bezierinspector
```

to:

```text
~/Library/Application Support/Adobe/CEP/extensions/
```

Final path:

```text
~/Library/Application Support/Adobe/CEP/extensions/com.ju.bezierinspector
```

## Windows

Create:

```text
%APPDATA%\Adobe\CEP\extensions\
```

if it does not exist.

Copy:

```text
com.ju.bezierinspector
```

to:

```text
%APPDATA%\Adobe\CEP\extensions\
```

Final path:

```text
%APPDATA%\Adobe\CEP\extensions\com.ju.bezierinspector
```

Then run:

```text
repair_windows.bat
```

and restart Illustrator.

---

# 🧪 Diagnostics

If installation still fails:

## macOS

```bash
bash diagnostics.sh
```

## Windows

Double-click:

```text
diagnostics_windows.bat
```

Send the generated log when reporting an issue.

---

# 🧾 Compatibility

Expected:

```text
Illustrator 2022–2026
```

Tested:

```text
Illustrator 2026
macOS
Apple Silicon
```

Windows 11 installer included.
