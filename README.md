# CrossRepo

**跨仓库改动管理工具 - 支持 AI 自动解决冲突**

## 解决的痛点

当一个功能涉及多个 Git 仓库，且需要同步到多个版本分支时：

- 每个仓库都要手动 cherry-pick
- 每个分支都要处理冲突
- 容易遗漏、容易出错
- 重复劳动、效率低下

**CrossRepo 让这一切自动化。**

## 安装

```bash
npm install -g crossrepo
```

## 快速开始

```bash
# 1. 初始化项目
crossrepo init feat/new-payment

# 2. 追踪仓库和 commits
crossrepo track ../repo-a --commits abc123,def456
crossrepo track ../repo-b --commits ghi789

# 3. 设置目标分支
crossrepo target repo-a --branches v1.0,v2.0,main
crossrepo target repo-b --branches v1.5,v2.0

# 4. 配置 AI（用于自动解决冲突）
crossrepo ai

# 5. 执行同步
crossrepo sync --auto-resolve
```

## 命令

| 命令 | 说明 |
|------|------|
| `init` | 初始化项目 |
| `track` | 追踪仓库和 commits |
| `target` | 设置目标分支 |
| `ai` | 配置 AI |
| `sync` | 执行同步 |
| `status` | 查看状态 |
| `list` | 列出追踪的仓库 |

## AI 冲突解决

当检测到冲突时，CrossRepo 会：
1. 提取冲突内容
2. 调用 AI 分析
3. 自动应用解决方案

## 配置文件

```yaml
feature: feat/new-payment

ai:
  provider: openai
  baseUrl: https://api.openai.com/v1
  model: gpt-4
  apiKey: ${OPENAI_API_KEY}

repos:
  repo-a:
    path: ../repo-a
    commits: [abc123, def456]
    targetBranches: [v1.0, v2.0, main]
```

## License

MIT