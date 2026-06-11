// ChatSheet — mobile bottom-sheet wrapper around the Hall ChatPanel.
// On phone widths the inline chat column is replaced by an "Open chat"
// button; tapping it slides this sheet up from the bottom.

import { createPortal } from 'react-dom'
import { useEffect } from 'react'
import { ChatPanel } from './ChatPanel'
import './ChatSheet.css'

export function ChatSheet({ canChat, onClose }: { canChat: boolean; onClose: () => void }) {
  // Lock body scroll + ESC-to-close while the sheet is open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return createPortal(
    <div
      className="puc-chatsheet"
      role="dialog"
      aria-label="Great Hall chat"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="puc-chatsheet__panel">
        <header className="puc-chatsheet__bar">
          <span className="puc-chatsheet__title">Great Hall chat</span>
          <button type="button" className="puc-chatsheet__close" onClick={onClose} aria-label="Close chat">
            ✕
          </button>
        </header>
        <div className="puc-chatsheet__body">
          <ChatPanel canChat={canChat} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
