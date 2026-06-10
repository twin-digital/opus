// Grinbox mockup app shell. Renders the sidebar based on `<body data-active="...">`
// and wires up theme toggle + Lucide icons.

;(function () {
  const NAV = [
    { key: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', href: 'dashboard.html' },
    { key: 'inbox', label: 'Inbox', icon: 'inbox', href: 'inbox.html' },
    { key: 'pipelines', label: 'Pipelines', icon: 'workflow', href: 'pipelines.html' },
    { key: 'accounts', label: 'Accounts', icon: 'mail', href: 'accounts.html' },
    { key: 'activity-log', label: 'Activity Log', icon: 'activity', href: 'activity-log.html' },
    { key: 'settings', label: 'Settings', icon: 'settings', href: 'settings-limits.html' },
  ]

  function navItem(item, active) {
    const isActive = item.key === active
    const cls =
      isActive ?
        'flex items-center gap-2 px-2 py-1.5 rounded-md bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 font-medium'
      : 'flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
    return `<li><a href="${item.href}" class="${cls}"><i data-lucide="${item.icon}" class="w-4 h-4"></i>${item.label}</a></li>`
  }

  function sidebarHTML(active) {
    const metricsCls =
      active === 'metrics' ?
        'flex items-center gap-2 px-2 py-1.5 rounded-md bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 font-medium'
      : 'flex items-center gap-2 px-2 py-1.5 rounded-md text-zinc-500 dark:text-zinc-500'
    return `
      <nav class="w-60 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col flex-none h-screen sticky top-0">
        <a href="index.html" class="p-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
          <div class="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white text-xs font-semibold">G</div>
          <span class="font-semibold text-sm">Grinbox</span>
        </a>
        <ul class="flex-1 p-3 space-y-0.5 text-sm">
          ${NAV.map((item) => navItem(item, active)).join('')}
          <li><a href="metrics.html" class="${metricsCls}"><i data-lucide="bar-chart-3" class="w-4 h-4"></i>Metrics<span class="ml-auto text-[10px] uppercase tracking-wide">soon</span></a></li>
        </ul>
        <div class="p-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <button class="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500" title="Collapse"><i data-lucide="panel-left-close" class="w-4 h-4"></i></button>
          <button id="theme-toggle" class="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500" title="Toggle theme"><i data-lucide="sun-moon" class="w-4 h-4"></i></button>
        </div>
      </nav>
    `
  }

  function init() {
    const active = document.body.dataset.active || ''
    const mount = document.getElementById('sidebar-mount')
    if (mount) mount.outerHTML = sidebarHTML(active)

    // Theme toggle wiring
    const root = document.documentElement
    const stored = localStorage.getItem('grinbox-mockup-theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (stored === 'dark' || (!stored && prefersDark)) root.classList.add('dark')
    const toggle = document.getElementById('theme-toggle')
    if (toggle) {
      toggle.addEventListener('click', () => {
        root.classList.toggle('dark')
        localStorage.setItem('grinbox-mockup-theme', root.classList.contains('dark') ? 'dark' : 'light')
      })
    }

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons()
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
