const { renderPage } = require('./layout')

function renderSuggestPage() {
    return renderPage({
        lang: 'vi',
        route: '/suggest',
        title: 'Gợi ý từ nối tiếp',
        description: 'Tra các từ có thể nối tiếp từ bạn nhập trong từ điển OrenjiNeko.',
        styles: `
    .suggest-intro { margin: 0 0 1.5rem; color: var(--muted); }
    .suggest-form label { display: block; margin-bottom: .375rem; font-weight: 650; }
    .suggest-controls { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .75rem; }
    .suggest-controls input, .suggest-controls button {
      min-width: 0;
      padding: .625rem .875rem;
      border: 1px solid var(--border);
      border-radius: 10px;
      font: inherit;
      line-height: 1.5;
    }
    .suggest-controls input { background: var(--bg); color: var(--text); }
    .suggest-controls input::placeholder { color: var(--muted); }
    .suggest-controls input[aria-invalid="true"] { border-color: #fca5a5; }
    .suggest-controls button { border-color: transparent; background: var(--accent); color: var(--bg); font-weight: 700; cursor: pointer; }
    .suggest-controls button:hover:not(:disabled) { background: #fdba74; }
    .suggest-controls button:disabled { opacity: .65; cursor: wait; }
    .suggest-controls :focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    .suggest-feedback { margin: 0; color: var(--muted); }
    .suggest-feedback:not(:empty) { margin-top: 1.5rem; }
    .suggest-feedback.is-error { color: #fca5a5; }
    .suggest-results { display: flex; flex-wrap: wrap; gap: .5rem; margin: 0; padding: 0; list-style: none; }
    .suggest-results:not(:empty) { margin-top: .75rem; }
    .suggest-results li { min-width: 0; padding: .3rem .75rem; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); }
    @media (max-width: 480px) {
      .suggest-controls { grid-template-columns: minmax(0, 1fr); }
    }`,
        content: `<section class="panel" aria-labelledby="suggest-title">
      <h1 id="suggest-title">Gợi ý từ nối tiếp</h1>
      <p class="suggest-intro">Các từ gợi ý sẽ bắt đầu bằng tiếng cuối của từ bạn nhập.</p>
      <form class="suggest-form" id="suggest-form" novalidate>
        <label for="suggest-word">Từ cần nối</label>
        <div class="suggest-controls">
          <input id="suggest-word" type="text" placeholder="Ví dụ: phở bò" required />
          <button type="submit">Gợi ý</button>
        </div>
      </form>
      <p id="suggest-feedback" class="suggest-feedback" role="status"></p>
      <ul id="suggest-results" class="suggest-results" role="list" aria-label="Các từ có thể nối tiếp"></ul>
    </section>
    <script>
      const form = document.getElementById('suggest-form')
      const input = document.getElementById('suggest-word')
      const button = form.querySelector('button')
      const feedback = document.getElementById('suggest-feedback')
      const results = document.getElementById('suggest-results')

      function showFeedback(message, isError = false) {
          feedback.classList.toggle('is-error', isError)
          feedback.textContent = message
      }

      input.addEventListener('input', () => {
          if (input.hasAttribute('aria-invalid')) {
              input.removeAttribute('aria-invalid')
              showFeedback('')
          }
      })

      form.addEventListener('submit', async event => {
          event.preventDefault()
          if (button.disabled) return
          const word = input.value.trim()
          results.replaceChildren()
          if (!word) {
              input.setAttribute('aria-invalid', 'true')
              showFeedback('Vui lòng nhập từ cần nối.', true)
              input.focus()
              return
          }

          button.disabled = true
          showFeedback('Đang tìm từ nối tiếp…')
          try {
              const response = await fetch('/api/suggest?word=' + encodeURIComponent(word))
              if (!response.ok) {
                  showFeedback('Không thể tải gợi ý. Vui lòng thử lại.', true)
                  return
              }
              const { suggestions } = await response.json()
              if (suggestions.length === 0) {
                  showFeedback('Không tìm thấy từ nào có thể nối tiếp.')
                  return
              }
              for (const suggestion of suggestions) {
                  const item = document.createElement('li')
                  item.textContent = suggestion
                  results.append(item)
              }
              showFeedback('Tìm thấy ' + suggestions.length + ' từ có thể nối tiếp.')
          } catch {
              showFeedback('Không thể kết nối đến máy chủ. Vui lòng thử lại.', true)
          } finally {
              button.disabled = false
          }
      })
    </script>`
    })
}

module.exports = { renderSuggestPage }
