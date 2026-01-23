# 仿真服务 (Simulation Service)

基于 Python 的电磁场仿真服务，提供数值计算和可视化功能。

## 技术栈

- Python 3.9+
- FastAPI (Web框架)
- NumPy (数值计算)
- SciPy (科学计算)
- Matplotlib (可视化)
- SymPy (符号计算，按需使用)

## 开发环境

```bash
# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# 安装依赖
pip install -r requirements.txt

# 启动开发服务器
uvicorn app.main:app --reload --port 8002
```

## 项目结构

```
app/
├── main.py           # 应用入口
├── routes/           # API路由
├── solvers/          # 求解器实现
│   ├── electrostatics.py    # 静电场求解
│   ├── magnetostatics.py    # 静磁场求解
│   ├── wave.py              # 波动方程求解
│   ├── laplace.py           # 拉普拉斯方程求解
│   └── numerical.py         # 数值计算工具
└── utils/            # 工具函数
```

## 主要功能

- 静电场数值仿真
- 静磁场数值仿真
- 电磁波传播仿真
- 拉普拉斯方程求解（演示接口）
- 数值积分和微分
- 可选：安全沙箱代码执行（教学演示）

## 仿真算法

- 有限差分/数值迭代（示例为主）
- 数值积分与差分工具

## 相关文档

- [API 文档](../../docs/api/simulation-services.md)
- [组件设计](../../docs/architecture/component-design.md)
