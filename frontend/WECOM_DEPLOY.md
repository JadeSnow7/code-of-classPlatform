# 企业微信前端部署指南

## 1. 概述
前端应用已集成了企业微信 OAuth 登录流程。

## 2. 部署要求
- 前端应用需要部署在企业微信可访问的域名下（公网 HTTPS）。
- 后端需要配置企业微信的相关参数。

## 3. 前端构建
前端无需特殊构建，只需确保 `API_BASE_URL` 配置正确。

```bash
# 构建生产环境
npm run build
```

## 4. 路由配置
已添加专门的回调路由：
- 路径: `/auth/wecom/callback`
- 功能: 接收 `code` 参数，自动与后端交换 Token 并登录。

## 5. 企业微信后台配置
1.  **构造授权链接**:
    后端提供了生成授权链接的接口，或者你可以手动构造：
    ```
    https://open.weixin.qq.com/connect/oauth2/authorize?appid=CORPID&redirect_uri=REDIRECT_URI&response_type=code&scope=snsapi_base&state=STATE#wechat_redirect
    ```
    其中 `REDIRECT_URI` 应该是前端部署后的回调地址 URL Encode 后的值，例如 `https://your-domain.com/auth/wecom/callback`。

2.  **配置可信域名**:
    在企业微信管理后台 -> 应用管理 -> 网页授权及JS-SDK，设置可信域名为前端部署的域名。

## 6. 使用流程
1.  用户在企业微信中点击应用菜单（配置为上述授权链接）。
2.  企业微信跳转到 OAuth 授权页（静默授权）。
3.  重定向回前端 `/auth/wecom/callback?code=CODE`。
4.  前端页面自动调用 API 换取 Token。
5.  登录成功，跳转至首页。

## 7. 调试
- 可以使用微信开发者工具（企业微信模式）进行调试。
- 确保本地开发环境 Host 配置与可信域名一致（可能需要代理）。
