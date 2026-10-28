# Shi Wa Nan Ma Shop

越南代購服飾網站（GitHub Pages 靜態網站，免費）。

- 公開網址：https://mu4540.github.io/shiwananma-shop/
- 管理頁：網址後面加 `#manage`；批次上架：`#batch`
- 商品資料：`products.json`；照片：`photos/`
- 程式：`index.html`、`style.css`、`app.js`（改設定看 `app.js` 最上方）

## 上架
1. 管理頁貼上 GitHub Fine-grained Token（只需此 repo 的 Contents 讀寫）
2. 單件：新增商品 → 照片（最多 5 張）、顏色（可指定對應照片）、尺寸、庫存勾選
3. 批次：一次選多張照片 → 依檔名／每 N 張／每張一件自動分組 → 共同設定或從 Excel 貼上 → 全部上架（一次 commit）
4. 儲存後約 1–2 分鐘 GitHub Pages 更新

### 批次檔名建議
`商品名稱-編號.jpg`，例：`亞麻寬褲-1.jpg`、`亞麻寬褲-2.jpg` → 同一件、名稱自動帶入。

### Excel 欄位順序
名稱｜價格｜分類｜尺寸｜顏色｜說明（一列一件，順序同批次頁商品順序；空白列 = 不改那件）

## 讓其他人也能上架
Repo → Settings → Collaborators → 加入對方 GitHub 帳號；對方用自己的 Token 登入。
