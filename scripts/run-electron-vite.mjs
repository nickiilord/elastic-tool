import { spawn } from 'node:child_process'

const args = process.argv.slice(2)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn('electron-vite', args, {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32'
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})
