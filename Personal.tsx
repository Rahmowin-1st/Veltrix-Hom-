/* =====================================================================
   Surfaces & primitives.

   Glass is a privilege, not a default. It is allowed ONLY on:
   composer · project hero · source panel · profile header ·
   floating menus · mobile bottom nav · auth panel.
   Everything else is a solid surface — cheaper and far more readable.
   ===================================================================== */

.glass {
  position: relative;
  background: var(--glass-bg);
  backdrop-filter: blur(var(--blur)) saturate(150%);
  -webkit-backdrop-filter: blur(var(--blur)) saturate(150%);
  border: 1px solid var(--glass-border);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-md);
}

/* Mirrored highlight: one thin sheen along the top edge, nothing more. */
.glass::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    linear-gradient(180deg, var(--glass-sheen) 0%, transparent 46%),
    var(--glass-tint);
  pointer-events: none;
}

.surface {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
}

.surface-quiet {
  background: var(--bg-hover);
  border: 1px solid var(--border-soft);
  border-radius: var(--r-md);
}

/* --- Buttons ------------------------------------------------------- */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-2);
  height: 40px;
  padding: 0 var(--s-4);
  border-radius: var(--r-md);
  border: 1px solid transparent;
  font-family: var(--font);
  font-size: var(--fs-sm);
  font-weight: 550;
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--t-hover) var(--ease),
              border-color var(--t-hover) var(--ease),
              transform var(--t-hover) var(--ease),
              opacity var(--t-hover) var(--ease);
}
.btn:active { transform: scale(0.975); }
.btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }

.btn-primary {
  background: var(--brand-600);
  color: var(--accent-text);
}
.btn-primary:hover:not(:disabled) { background: var(--brand-500); }

.btn-ghost {
  background: transparent;
  color: var(--text-2);
}
.btn-ghost:hover:not(:disabled) { background: var(--bg-hover); color: var(--text); }

.btn-outline {
  background: var(--bg-elevated);
  border-color: var(--border);
  color: var(--text);
}
.btn-outline:hover:not(:disabled) { border-color: var(--border-strong); }

.btn-icon {
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: var(--r-sm);
}

/* Every touch target clears 44px on coarse pointers. */
@media (pointer: coarse) {
  .btn { min-height: 44px; }
  .btn-icon { width: 44px; height: 44px; }
}

/* --- Chips --------------------------------------------------------- */
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border-radius: var(--r-pill);
  background: var(--bg-hover);
  border: 1px solid var(--border-soft);
  color: var(--text-2);
  font-size: var(--fs-label);
  font-weight: 500;
  white-space: nowrap;
  max-width: 100%;
}
.chip-strong {
  background: var(--accent-soft);
  border-color: color-mix(in srgb, var(--accent) 32%, transparent);
  color: var(--text);
}
.chip-btn { cursor: pointer; transition: background var(--t-hover) var(--ease); }
.chip-btn:hover { background: var(--bg-active); }

/* --- Text helpers --------------------------------------------------- */
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.muted { color: var(--text-2); }
.micro { font-size: var(--fs-micro); color: var(--text-3); }

.row { display: flex; align-items: center; gap: var(--s-2); }
.col { display: flex; flex-direction: column; }

.hide-sb { scrollbar-width: none; -ms-overflow-style: none; }
.hide-sb::-webkit-scrollbar { display: none; }

/* --- Skeleton (never a blocking spinner) ---------------------------- */
.skeleton {
  background: linear-gradient(
    90deg,
    var(--bg-hover) 25%,
    color-mix(in srgb, var(--bg-hover) 55%, var(--border)) 37%,
    var(--bg-hover) 63%
  );
  background-size: 400% 100%;
  animation: sk 1.4s ease infinite;
  border-radius: var(--r-sm);
}
@keyframes sk {
  0%   { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}
[data-motion='reduced'] .skeleton { animation: none; }

/* --- Accessible visually-hidden ------------------------------------- */
.sr-only {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

/* --- Sidebar chat rows: menu button appears on hover/focus ---------- */
.chat-row:hover { background: var(--bg-hover); }
.chat-menu-btn { opacity: 0; transition: opacity var(--t-hover) var(--ease), background var(--t-hover) var(--ease); }
.chat-row:hover .chat-menu-btn,
.chat-row:focus-within .chat-menu-btn { opacity: 1; }
.chat-menu-btn:hover { background: var(--bg-hover); color: var(--text); }
/* Touch devices have no hover — always show it there. */
@media (pointer: coarse) { .chat-menu-btn { opacity: 1; } }
