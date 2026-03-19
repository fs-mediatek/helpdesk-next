// Next.js instrumentation hook — runs once when the server starts.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initPlugins } = await import('./src/lib/plugins/init')
    initPlugins()
  }
}
