// 用 shadcn CLI 安装组件后，把 registry 生成的 "cn" 导入修正为项目的 utils 别名。
// 用法：pnpm ui:add button dialog
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const components = process.argv.slice(2)
if (components.length === 0) {
  console.error('用法：pnpm ui:add <component...>')
  process.exit(1)
}

const result = spawnSync('pnpm', ['dlx', 'shadcn@latest', 'add', ...components, '-y', '-o'], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
})
if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1)

const uiDir = join(process.cwd(), 'src', 'renderer', 'components', 'ui')
let fixed = 0
for (const file of readdirSync(uiDir)) {
  if (!file.endsWith('.tsx') && !file.endsWith('.ts')) continue
  const path = join(uiDir, file)
  const source = readFileSync(path, 'utf8')
  const next = source.replaceAll('from "cn"', 'from "@/lib/utils"')
  if (next !== source) {
    writeFileSync(path, next)
    fixed += 1
  }
}
console.log(fixed > 0 ? `已修正 ${fixed} 个文件里的 utils 导入。` : 'utils 导入无需修正。')
