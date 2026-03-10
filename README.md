# 純喫茶包裝設計器（MVP）

線上編輯包裝展開圖（2D）並即時預覽成 3D 成果；支援本機 localStorage 自動儲存與 JSON 匯出/匯入。

## 功能
- 模板切換（各模板各自保存狀態）
  - 盒型（carton）十字展開：Front/Back/Left/Right/Top/Bottom
  - 立體袋（pouch）簡化：Front/Back
  - 罐身貼標（cylinder label）：Label
- 2D 展開圖：點選面、上傳圖片，並用滑鼠拖曳/縮放/旋轉
- 右側 3D 即時預覽（CSS 3D；cylinder label 為假 3D 分段預覽）
- 自動儲存到 localStorage
- 匯出/匯入設計（JSON，含圖片 dataURL）
- 匯入容錯：舊版/缺欄位 JSON 會自動補齊預設值
- 儲存提示：localStorage 容量不足時會提示改用匯出 JSON

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
