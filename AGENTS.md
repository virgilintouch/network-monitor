# Agent Instructions

- 完成任务时连续执行多步操作，不要每做一步就停下来等用户说「继续」
- 读取项目内文件时优先使用内置文件工具，不要对 workspace 内文件请求 require_escalated
- 只有 docker、网络、写 workspace 外路径时才请求提权
- 一个任务从开始到验证完成，尽量在同一个 turn 内做完
