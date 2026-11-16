// fit match view to window
(function () {
  let queued = false

  function fit() {
    queued = false
    const view = document.querySelector('app-match-view')
    const scroller = document.querySelector('st-scrollable-content')
    if (!view || !scroller) {
      document.documentElement.classList.remove('fit')
      return
    }

    // min-height:100vh on this hides the actual free space
    const inner = scroller.firstElementChild
    inner.style.minHeight = '0'
    const overflow = () => inner.offsetHeight - scroller.clientHeight

    let zoom = parseFloat(view.style.zoom) || 1
    // zoom changes the layout so one pass isn't enough
    for (let i = 0; i < 4; i++) {
      const h = view.getBoundingClientRect().height
      if (!h) break
      const z = Math.min(1.2, Math.max(0.5, zoom * (h - overflow()) / h))
      if (Math.abs(z - zoom) < 0.005) break
      zoom = z
      view.style.zoom = zoom
    }

    document.documentElement.classList.toggle('fit', overflow() <= 1)
    inner.style.minHeight = ''
  }

  function queue() {
    if (queued) return
    queued = true
    requestAnimationFrame(fit)
  }

  window.addEventListener('resize', queue)
  new MutationObserver(queue).observe(document.body, { childList: true, subtree: true, characterData: true })
  queue()
})()


// copy stats button
;(function () {
  const ICON_COPY = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>'
  const ICON_OK = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>'

  function txt(el) {
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''
  }

  function getStats(row) {
    const grid = row.querySelector('[appMatchPlayerGrid]')
    const clan = txt(grid.querySelector('strong'))
    const name = txt(grid.querySelector('.whitespace-nowrap > .min-w-0'))
    const ship = txt(grid.querySelector('.text-md > span'))
    const out = [(clan + ' ' + name).trim(), ship]

    const cols = grid.querySelectorAll(':scope > .tabular-nums')
    // hidden profiles and bots don't have the stat columns
    if (cols.length < 4) {
      out.push(txt(grid.querySelector(':scope > .text-text-secondary')))
      return out.join('\n')
    }

    const vals = col => Array.from(col.querySelectorAll('[app-match-player-value]'), txt)
    const fmt = (label, col) => {
      const [acc, s] = vals(col)
      return label + ' ' + s + ' (acc ' + acc + ')'
    }

    out.push('PR ' + vals(cols[0])[0])
    out.push(fmt('WR', cols[1]))
    out.push(fmt('Battles', cols[2]))
    out.push(fmt('Dmg', cols[3]))
    return out.join('\n')
  }

  function addBtn(row) {
    if (row.querySelector('.copy-btn')) return
    const btn = document.createElement('button')
    btn.className = 'copy-btn'
    btn.title = 'Copy stats'
    btn.innerHTML = ICON_COPY
    btn.onclick = async e => {
      e.stopPropagation() // row click opens the player popup
      await navigator.clipboard.writeText(getStats(row))
      btn.innerHTML = ICON_OK
      btn.classList.add('copied')
      setTimeout(() => {
        btn.innerHTML = ICON_COPY
        btn.classList.remove('copied')
      }, 1200)
    }
    row.append(btn)
  }

  const addAll = () => document.querySelectorAll('[app-match-player]').forEach(addBtn)
  new MutationObserver(addAll).observe(document.body, { childList: true, subtree: true })
  addAll()
})()
