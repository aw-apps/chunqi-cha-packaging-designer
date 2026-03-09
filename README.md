# 純喫茶包裝設計器（MVP）

線上編輯包裝展開圖（2D）並即時預覽折成 3D 盒型成果；支援本機 localStorage 自動儲存與 JSON 匯出/匯入。

## 功能
- 2D 展開圖：點選面（Front/Back/Left/Right/Top/Bottom）
- 每個面可上傳圖片並用滑鼠拖曳/縮放/旋轉
- 右側 3D 即時預覽（CSS 3D 折盒）
- 自動儲存到 localStorage
- 匯出/匯入設計（JSON，含圖片 dataURL）

## 操作
- 點選展開圖中的面：選取
- 拖曳：移動圖片
- 滾輪：縮放
- Shift + 滾輪：旋轉
- 右上按鈕：匯出 / 匯入 / 清除

## 部署
此 repo 已啟用 GitHub Pages（由工具自動開啟）。

## 開發
這是零相依的靜態網站：
- `index.html`
- `style.css`
- `app.js`

> 想讓 Copilot 自動持續開發：用 Telegram 指令 `/build aw-apps/chunqi-cha-packaging-designer`。
