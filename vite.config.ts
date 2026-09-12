import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const runtime = globalThis as typeof globalThis & {
	process?: { env?: Record<string, string | undefined> }
}

export default defineConfig({
	base: runtime.process?.env?.GITHUB_ACTIONS ? '/ARVR/' : '/',
	plugins: [react()],
})