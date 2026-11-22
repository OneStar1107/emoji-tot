# 代码签名

安装包目前**没有签名**：没有证书就无法签，这不是配置问题。结果是首次运行时 SmartScreen 会提示「未知发布者」，用户要手动点「仍要运行」。

## 三条路，按性价比排

### 1. Azure Trusted Signing（推荐）

微软的云签名服务，个人可申请，约 **$9.99/月**，不需要买硬件令牌。

1. 在 Azure 门户创建 Trusted Signing 账户 + 证书配置（需通过一次身份验证）
2. 装 `@azure/trusted-signing-cli` 或直接用 electron-builder 的 `azureSignOptions`
3. 把下面这一段填进 `apps/desktop/package.json` 的 `build.win`：

```json
"azureSignOptions": {
  "publisherName": "OneStar1107",
  "endpoint": "https://<region>.codesigning.azure.net",
  "codeSigningAccountName": "<account>",
  "certificateProfileName": "<profile>"
}
```

### 2. 传统 OV 代码签名证书

Sectigo / DigiCert 等，约 $200–400/年，会寄一个硬件令牌（或云 HSM）。拿到 `.pfx` 后：

```bash
export CSC_LINK=/path/to/cert.pfx
export CSC_KEY_PASSWORD=...
pnpm --filter @emojitot/desktop exec electron-builder --win nsis
```

electron-builder 会自动读取这两个环境变量，配置里不写任何密码。

### 3. 自签名（只适合内部试装）

```powershell
New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=EmojiTot" \
  -CertStoreLocation Cert:\\CurrentUser\\My
```

**它不会消除 SmartScreen 警告**——证书不在信任链里，效果和未签名一样，只适合自己验证流程通不通。

## 签完之后要验什么

```powershell
Get-AuthenticodeSignature release/EmojiTot.Setup.<version>.exe | Format-List Status, SignerCertificate
```

`Status` 应为 `Valid`。同时确认 `release/EmojiTot.exe`（主程序）和 `EmojiTot.Setup.*.__uninstaller.exe`（卸载器）也都签上了——electron-builder 只在配置了证书时才会签卸载器。

## 打包流水线的位置

证书参数一律走环境变量（`CSC_LINK` / `CSC_KEY_PASSWORD` 或 Azure 的凭据），**不要写进仓库**。本地与 CI 用同一套：有环境变量就签名，没有就跳过并打印一行 `no code signing certificate configured`。
