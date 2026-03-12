# AutoDL -> 阿里云 FRP 穿透

## 阿里云状态

- `frps` 监听: `47.121.194.134:7000`
- `nginx` 监听: `47.121.194.134:80`
- 公网入口: `http://47.121.194.134/`

## AutoDL 侧目标

把本机 `127.0.0.1:7860` 映射到阿里云 `127.0.0.1:17860`。

## AutoDL 执行顺序

1. 确保 `web_tester.py` 已启动，监听 `7860`
2. 将 `autodl-frpc.toml` 上传到:
   - `/root/graduationDesign/code/ai_service/deploy/autodl-frpc.toml`
3. 执行:

```bash
bash /root/graduationDesign/code/ai_service/deploy/start_autodl_frpc.sh
```

4. 查看日志:

```bash
tail -f /root/graduationDesign/code/ai_service/frpc.log
```

## 验收

- 阿里云本机:

```bash
curl -I http://127.0.0.1:17860
```

- 公网:

```bash
curl -I http://47.121.194.134/
```
