# Veltrix Hom — Chat UI update

This update changes only the conversation experience and leaves the existing backend, source processing, account sync, Personal, General, Sources, Talent, tests, games, appearance settings and database migrations unchanged.

## Updated

- ChatGPT-inspired mobile/desktop chat composition.
- Floating glass header with menu, new chat and chat actions.
- AI answers take most of the conversation width and align to the left.
- AI avatar/logo was removed from every answer and loading state.
- User messages remain compact and right-aligned with a blue/white glass gradient.
- Existing blue/white gradient background, uploaded background image and sticker decoration remain intact.
- AI actions now use compact icon controls:
  - copy;
  - like;
  - dislike;
  - read aloud / stop;
  - native share with clipboard fallback;
  - more menu;
  - regenerate response.
- Feedback selection is remembered locally per message.
- Loading state is a left-aligned floating pill without an AI logo.
- Source/Talent context remains above the composer instead of duplicating at the top of the conversation.
- Composer is wider, floated, blurred and responsive, while keeping upload, microphone, send/stop and context selection logic unchanged.
- Dedicated mobile and desktop breakpoints were added.

## Database

No new SQL migration is required for this design-only update.
