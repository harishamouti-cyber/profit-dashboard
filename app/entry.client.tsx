import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

// Netlify's CDN injects an HTML comment (preceded by a newline) into <head> of every page.
// React 18 cannot hydrate around that stray whitespace text node: it throws #418/#423 and
// client-renders the whole document from scratch. That detaches the server-rendered
// <s-app-nav> App Bridge is bound to, so admin nav clicks change the URL but the
// shopify:navigate event never reaches React Router. React never renders comments or
// bare text directly in <head>, so strip them before hydrating.
for (const node of Array.from(document.head.childNodes)) {
  if (node.nodeType === Node.COMMENT_NODE || (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim())) {
    node.remove();
  }
}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
});
