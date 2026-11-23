# 代码签名

项目现在支持**本机自签名构建**：`pnpm dist:selfsigned` 会复用
`Cert:\CurrentUser\My` 下的 EmojiTot 代码签名证书；没有时创建一张，把公钥加入
当前用户的受信任根，并签主程序、卸载器、安装包和最终便携版。

自签名能证明文件没有被换掉，也能让当前电脑显示 `Valid`，但**不会建立
Microsoft SmartScreen 信誉**。其他电脑第一次运行仍可能显示「未知发布者」，
用户需要手动点「仍要运行」。

当前项目证书的 Subject 是 `CN=OneStar1107, O=EmojiTot, C=CN`。私钥只保存在
当前用户的证书库，构建时临时导出的 PFX 使用随机密码，结束后移入回收站，不会
进入仓库或发布包。

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

### 3. 自签名（当前使用的流程）

```powershell
New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=OneStar1107, O=EmojiTot, C=CN" \
  -CertStoreLocation Cert:\\CurrentUser\\My
```

仓库已经把这套步骤封装为：

```powershell
pnpm dist:selfsigned
```

它会在本机显示 `Valid`。在没有导入这张自签证书的设备上，SmartScreen 仍会提示
「未知发布者」。

## 签完之后要验什么

```powershell
Get-AuthenticodeSignature release/EmojiTot.exe | Format-List Status, SignerCertificate
```

`Status` 应为 `Valid`。同时确认 `release/win-unpacked/EmojiTot.exe`（主程序）、
`release/EmojiTot.Setup.exe`、`release/EmojiTot.Portable.exe` 和安装后的卸载器
都签上了。公开便携版是在 electron-builder 完成后再拼接的，所以构建脚本会补签
这一层包装。

## 打包流水线的位置

证书参数一律走环境变量（`CSC_LINK` / `CSC_KEY_PASSWORD` 或 Azure 的凭据），**不要写进仓库**。本地与 CI 用同一套：有环境变量就签名，没有就跳过并打印一行 `no code signing certificate configured`。
